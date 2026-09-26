import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sFirmom } from "@/lib/firma-db";
import { odabirPartnera } from "@/queries/partneri";
import { napraviFirmu, napraviKorisnika, ocistiBazu, TESTNA_LOZINKA, testnaPrisma, testniOib } from "@/test/baza";
import { mojeFirme, novaFirma, odgovoriNaPoziv, otkaziPoziv, pozivPoTokenu, pozoviKorisnika, prebaciFirmu } from "./firme";
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

  it("poziv: samo uz poveznicu i prijavu pozvanom e-poštom; uloga ne veća od vlastite; jednokratan, istječe, otkaz", async () => {
    const a = await napraviFirmu(prisma, "Alfa");
    const b = await napraviFirmu(prisma, "Beta");
    const adminA = await napraviKorisnika(prisma, a.id);
    const ana = await napraviKorisnika(prisma, b.id, { email: "ana@beta.hr" });
    const drugi = await napraviKorisnika(prisma, b.id, { email: "drugi@beta.hr" });
    const voditeljA = await napraviKorisnika(prisma, a.id, { uloga: "Voditelj" });
    const A = await akter(a.id, adminA.id);
    const prodavac = a.uloge["Prodavač"]!;

    await expect(pozoviKorisnika(prisma, await akter(a.id, voditeljA.id), { email: "ana@beta.hr", ulogaId: prodavac })).rejects.toThrow();
    const { token } = await pozoviKorisnika(prisma, A, { email: "ANA@beta.hr", ulogaId: prodavac });
    await pozoviKorisnika(prisma, A, { email: "nitko@nigdje.hr", ulogaId: prodavac }); // ne otkriva postoji li račun
    await expect(pozoviKorisnika(prisma, A, { email: voditeljA.email, ulogaId: prodavac })).rejects.toThrow("već u firmi");
    await expect(pozoviKorisnika(prisma, A, { email: "x@y.hr", ulogaId: b.uloge["Prodavač"]! })).rejects.toThrow("ulogu");
    expect(await prisma.pozivUFirmu.findFirst({ where: { tokenHash: token } })).toBeNull(); // u bazi samo hash

    expect(await pozivPoTokenu(prisma, token)).toMatchObject({ firma: "Alfa", uloga: "Prodavač", email: "ana@beta.hr" });
    await expect(odgovoriNaPoziv(prisma, { id: drugi.id, email: drugi.email }, token, true, null)).rejects.toThrow("drugu e-poštu");
    await expect(odgovoriNaPoziv(prisma, { id: ana.id, email: ana.email }, "krivi-token", true, null)).rejects.toThrow("ne postoji");
    await expect(
      odgovoriNaPoziv(prisma, { id: ana.id, email: ana.email }, token, true, null, new Date(Date.now() + 8 * 24 * 3600_000)),
    ).rejects.toThrow("istekao");
    await odgovoriNaPoziv(prisma, { id: ana.id, email: ana.email }, token, true, null);
    await expect(odgovoriNaPoziv(prisma, { id: ana.id, email: ana.email }, token, true, null)).rejects.toThrow("ne postoji");
    expect((await mojeFirme(prisma, ana.id)).map((f) => f.naziv)).toEqual(["Alfa", "Beta"]);
    expect((await pravaClana(prisma, a.id, ana.id))?.moduli["prodaja"]).toBe("operativno");

    // novi poziv istoj osobi daje novu poveznicu, stara više ne vrijedi
    const n1 = await pozoviKorisnika(prisma, A, { email: "nitko@nigdje.hr", ulogaId: prodavac });
    expect(await pozivPoTokenu(prisma, n1.token)).not.toBeNull();
    const n = await prisma.pozivUFirmu.findFirstOrThrow({ where: { email: "nitko@nigdje.hr" } });
    await expect(otkaziPoziv(prisma, await akter(b.id, ana.id), n.id)).rejects.toThrow("ne postoji");
    await otkaziPoziv(prisma, A, n.id);
    expect(await pozivPoTokenu(prisma, n1.token)).toBeNull();
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
