import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { uredajiKlijenta, uredajKlijenta } from "@/queries/portal";
import { napraviFirmu, napraviKorisnika, ocistiBazu, TESTNA_LOZINKA, testnaPrisma } from "@/test/baza";
import { odjaviPortal, prijaviPortal, provjeriSesijuPortala } from "./portal";
import { prijavi } from "./prijava";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const hash = bcrypt.hashSync(TESTNA_LOZINKA, 4);

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const [a, b] = await Promise.all(
    ["Klijent A d.o.o.", "Klijent B d.o.o."].map((naziv) => prisma.partner.create({ data: { firmaId: firma.id, naziv } })),
  );
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const m = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "ProBook", proizvodjacId: p.id, kategorijaId: kat.id } });
  const ur = (serijski: string, partnerId: string | null, stanje: "PRODAN" | "U_NAJMU" | "NA_SKLADISTU" = "PRODAN") =>
    prisma.uredaj.create({
      data: {
        firmaId: firma.id,
        serijski,
        modelId: m.id,
        stanje,
        partnerId,
        skladisteId: partnerId ? null : skl.id,
        jamstvoDo: new Date("2027-01-01"),
      },
    });
  const ua = await ur("A-1", a!.id);
  await ur("A-2", a!.id, "U_NAJMU");
  const ub = await ur("B-1", b!.id);
  const us = await ur("S-1", null, "NA_SKLADISTU");
  const klijent = (partnerId: string, email: string) =>
    prisma.korisnikPortala.create({ data: { firmaId: firma.id, partnerId, ime: "Ivana", email, lozinkaHash: hash } });
  const ka = await klijent(a!.id, "ivana@a.hr");
  await klijent(b!.id, "marko@b.hr");
  return { firma, a: a!, b: b!, ua, ub, us, ka };
}

const prijava = (email: string, lozinka = TESTNA_LOZINKA, ip = "10.0.0.1") => prijaviPortal(prisma, { email, lozinka, ip });

describe("portal: prijava i sesija", () => {
  it("prijava vidi samo svog partnera; kriva lozinka i nepostojeći e-mail daju istu poruku; odjava briše sesiju", async () => {
    const { a } = await pripremi();
    const r = await prijava("  IVANA@a.hr ");
    if (!r.ok) throw new Error(r.greska);
    expect(await provjeriSesijuPortala(prisma, r.token)).toMatchObject({ partner: { id: a.id }, korisnik: { email: "ivana@a.hr" } });
    const krivo = await prijava("ivana@a.hr", "kriva-lozinka-123");
    const nema = await prijava("nitko@a.hr");
    expect(krivo).toEqual({ ok: false, greska: "Neispravna e-pošta ili lozinka." });
    expect(nema).toEqual(krivo);
    await odjaviPortal(prisma, r.token);
    expect(await provjeriSesijuPortala(prisma, r.token)).toBeNull();
  });

  it("nakon 5 krivih pokušaja zaključano i s ispravnom lozinkom; prijava u program se broji odvojeno", async () => {
    const { firma } = await pripremi();
    for (let i = 0; i < 5; i++) await prijava("ivana@a.hr", "kriva-lozinka-123");
    const r = await prijava("ivana@a.hr");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.greska).toMatch(/Previše neuspjelih/);
    // isti e-mail kao korisnik programa: zaključan portal ne zaključava program
    await napraviKorisnika(prisma, firma.id, { email: "ivana@a.hr" });
    expect((await prijavi(prisma, { email: "ivana@a.hr", lozinka: TESTNA_LOZINKA, ip: "10.0.0.1" })).ok).toBe(true);
  });

  it("isključen klijent ili partner odmah gubi sesiju; token programa ne vrijedi na portalu", async () => {
    const { a, ka, firma } = await pripremi();
    const r = await prijava("ivana@a.hr");
    if (!r.ok) throw new Error(r.greska);
    await prisma.korisnikPortala.update({ where: { id: ka.id }, data: { aktivan: false } });
    expect(await provjeriSesijuPortala(prisma, r.token)).toBeNull();
    expect((await prijava("ivana@a.hr")).ok).toBe(false);
    await prisma.korisnikPortala.update({ where: { id: ka.id }, data: { aktivan: true } });
    await prisma.partner.update({ where: { id: a.id }, data: { aktivan: false } });
    expect(await provjeriSesijuPortala(prisma, r.token)).toBeNull();
    await napraviKorisnika(prisma, firma.id, { email: "admin@firma.hr" });
    const p = await prijavi(prisma, { email: "admin@firma.hr", lozinka: TESTNA_LOZINKA, ip: "10.0.0.2" });
    if (!p.ok) throw new Error(p.greska);
    expect(await provjeriSesijuPortala(prisma, p.token)).toBeNull();
  });
});

describe("portal: napad na tuđe uređaje", () => {
  it("klijent vidi samo svoje uređaje; tuđi i skladišni po id-u ne postoje", async () => {
    const { firma, a, ub, us, ua } = await pripremi();
    const k = { firmaId: firma.id, partnerId: a.id };
    const l = await uredajiKlijenta(prisma, k, { stranica: 1, velicina: 50 });
    expect(l.redovi.map((u) => u.serijski)).toEqual(["A-1", "A-2"]);
    expect(await uredajKlijenta(prisma, k, ua.id)).toMatchObject({ serijski: "A-1" });
    expect(await uredajKlijenta(prisma, k, ub.id)).toBeNull();
    expect(await uredajKlijenta(prisma, k, us.id)).toBeNull();
    expect(await uredajKlijenta(prisma, k, "nije-uuid")).toBeNull();
    // ista partnerId u drugoj firmi ne otvara ništa
    const druga = await napraviFirmu(prisma);
    expect(await uredajKlijenta(prisma, { firmaId: druga.id, partnerId: a.id }, ua.id)).toBeNull();
    // uređaj klijenta ne otkriva nabavnu cijenu ni internu napomenu
    expect(Object.keys((await uredajKlijenta(prisma, k, ua.id))!)).not.toContain("nabavnaCijena");
    expect(Object.keys((await uredajKlijenta(prisma, k, ua.id))!)).not.toContain("napomena");
  });
});
