import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sFirmom } from "@/lib/firma-db";
import { odabirPartnera } from "@/queries/partneri";
import { napraviFirmu, napraviKorisnika, ocistiBazu, TESTNA_LOZINKA, testnaPrisma, testniOib } from "@/test/baza";
import { mojeFirme, mojiPozivi, novaFirma, odgovoriNaPoziv, otkaziPoziv, pozoviKorisnika, prebaciFirmu } from "./firme";
import { pravaClana, type Akter } from "./korisnici";
import { prijavi, provjeriSesiju } from "./prijava";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function akter(firmaId: string, korisnikId: string): Promise<Akter> {
  return { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))!, ip: null };
}

describe("više firmi", () => {
  it("nova firma, prelazak (ista sesija), prijava ulazi u zadnju firmu", async () => {
    const a = await napraviFirmu(prisma, "Alfa");
    const admin = await napraviKorisnika(prisma, a.id, { email: "admin@alfa.hr" });
    const voditelj = await napraviKorisnika(prisma, a.id, { uloga: "Voditelj" });
    await expect(novaFirma(prisma, await akter(a.id, voditelj.id), { naziv: "X", oib: testniOib() })).rejects.toThrow("administrator");
    const oib = testniOib();
    const b = await novaFirma(prisma, await akter(a.id, admin.id), { naziv: "Beta", oib });
    await expect(novaFirma(prisma, await akter(a.id, admin.id), { naziv: "Beta 2", oib })).rejects.toThrow("već postoji");
    expect((await mojeFirme(prisma, admin.id)).map((f) => [f.naziv, f.uloga])).toEqual([
      ["Alfa", "Administrator"],
      ["Beta", "Administrator"],
    ]);
    expect(await prisma.skladiste.count({ where: { firmaId: b.id } })).toBe(1);

    const p = await prijavi(prisma, { email: "admin@alfa.hr", lozinka: TESTNA_LOZINKA, ip: "1.1.1.1" });
    if (!p.ok) throw new Error(p.greska);
    expect(p.firmaId).toBe(a.id);
    const s = (await provjeriSesiju(prisma, p.token))!;
    await prebaciFirmu(prisma, { sesijaId: s.sesijaId, korisnikId: admin.id, ip: null }, b.id);
    expect((await provjeriSesiju(prisma, p.token))!.firma.naziv).toBe("Beta");
    const p2 = await prijavi(prisma, { email: "admin@alfa.hr", lozinka: TESTNA_LOZINKA, ip: "1.1.1.1" });
    expect(p2.ok && p2.firmaId).toBe(b.id);

    // voditelj nije član Bete; tuđa sesija se ne može prebaciti
    await expect(prebaciFirmu(prisma, { sesijaId: s.sesijaId, korisnikId: voditelj.id, ip: null }, b.id)).rejects.toThrow("Nemate pristup");
    // isključeno članstvo: prijava ulazi u drugu firmu
    await prisma.clanstvoFirme.updateMany({ where: { firmaId: b.id, korisnikId: admin.id }, data: { aktivno: false } });
    expect(await provjeriSesiju(prisma, p.token)).toBeNull();
    const p3 = await prijavi(prisma, { email: "admin@alfa.hr", lozinka: TESTNA_LOZINKA, ip: "1.1.1.1" });
    expect(p3.ok && p3.firmaId).toBe(a.id);
  });

  it("poziv: samo pozvana osoba prihvaća; uloga ne veća od vlastite; otkazani poziv nestaje", async () => {
    const a = await napraviFirmu(prisma, "Alfa");
    const b = await napraviFirmu(prisma, "Beta");
    const adminA = await napraviKorisnika(prisma, a.id);
    const ana = await napraviKorisnika(prisma, b.id, { email: "ana@beta.hr" });
    const drugi = await napraviKorisnika(prisma, b.id, { email: "drugi@beta.hr" });
    const voditeljA = await napraviKorisnika(prisma, a.id, { uloga: "Voditelj" });
    const A = await akter(a.id, adminA.id);

    await expect(pozoviKorisnika(prisma, await akter(a.id, voditeljA.id), { email: "ana@beta.hr", ulogaId: a.uloge["Prodavač"]! })).rejects.toThrow();
    await pozoviKorisnika(prisma, A, { email: "ANA@beta.hr", ulogaId: a.uloge["Prodavač"]! });
    await pozoviKorisnika(prisma, A, { email: "nitko@nigdje.hr", ulogaId: a.uloge["Prodavač"]! }); // ne otkriva postoji li račun
    await expect(pozoviKorisnika(prisma, A, { email: voditeljA.email, ulogaId: a.uloge["Prodavač"]! })).rejects.toThrow("već u firmi");
    await expect(pozoviKorisnika(prisma, A, { email: "x@y.hr", ulogaId: b.uloge["Prodavač"]! })).rejects.toThrow("ulogu");

    const pozivi = await mojiPozivi(prisma, "ana@beta.hr");
    expect(pozivi.map((p) => [p.firma, p.uloga])).toEqual([["Alfa", "Prodavač"]]);
    await expect(odgovoriNaPoziv(prisma, { id: drugi.id, email: drugi.email }, pozivi[0]!.id, true, null)).rejects.toThrow("ne postoji");
    await odgovoriNaPoziv(prisma, { id: ana.id, email: ana.email }, pozivi[0]!.id, true, null);
    expect((await mojeFirme(prisma, ana.id)).map((f) => f.naziv)).toEqual(["Alfa", "Beta"]);
    expect((await pravaClana(prisma, a.id, ana.id))?.moduli["prodaja"]).toBe("operativno");
    expect(await mojiPozivi(prisma, "ana@beta.hr")).toEqual([]);

    const n = await prisma.pozivUFirmu.findFirstOrThrow({ where: { email: "nitko@nigdje.hr" } });
    await expect(otkaziPoziv(prisma, await akter(b.id, ana.id), n.id)).rejects.toThrow("ne postoji");
    await otkaziPoziv(prisma, A, n.id);
    expect(await prisma.pozivUFirmu.count()).toBe(0);
  });

  it("odvojenost: pretraga partnera i upiti kroz dbFirme vide samo svoju firmu", async () => {
    const a = await napraviFirmu(prisma, "Alfa");
    const b = await napraviFirmu(prisma, "Beta");
    await prisma.partner.createMany({
      data: [
        { firmaId: a.id, naziv: "Kupac Zajednički", kupac: true },
        { firmaId: b.id, naziv: "Kupac Zajednički", kupac: true },
        { firmaId: b.id, naziv: "Kupac Samo Beta", kupac: true },
      ],
    });
    const dbA = sFirmom(prisma, a.id);
    const r = await odabirPartnera(dbA, a.id, "Kupac");
    expect(r.map((p) => p.naziv)).toEqual(["Kupac Zajednički"]);
    // i kad se (greškom) traži tuđa firma, dbFirme vraća prazno
    expect(await odabirPartnera(dbA, b.id, "Kupac")).toEqual([]);
    expect(await dbA.partner.count()).toBe(1);
  });
});
