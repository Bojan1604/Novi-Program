import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { prijaviPortal, provjeriSesijuPortala } from "./portal";
import {
  dodajKlijentaPortala,
  novaLozinkaKlijenta,
  novaPoveznicaKlijenta,
  postaviAktivnostKlijenta,
  postaviLozinkuPoveznicom,
} from "./portal-pristup";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const LOZINKA = "Klijent-lozinka-2026";

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const v = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: v.id, prava: (await pravaClana(prisma, firma.id, v.id))! };
  const partner = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Klijent d.o.o." } });
  return { firma, A, partner };
}
const prijava = (email: string, lozinka = LOZINKA) => prijaviPortal(prisma, { email, lozinka, ip: "10.1.1.1" });

describe("upravljanje pristupom portalu", () => {
  it("dodaj → poveznica (jednokratna) → lozinka → prijava; nova poveznica poništava staru; istekla ne vrijedi", async () => {
    const { A, partner } = await pripremi();
    const { id, token } = await dodajKlijentaPortala(prisma, A, partner.id, { ime: "Ivana", email: "Ivana@Klijent.hr" });
    expect((await prijava("ivana@klijent.hr")).ok).toBe(false); // još nema lozinku
    await expect(postaviLozinkuPoveznicom(prisma, token, "kratka")).rejects.toThrow();
    expect(await postaviLozinkuPoveznicom(prisma, token, LOZINKA)).toEqual({ email: "ivana@klijent.hr" });
    await expect(postaviLozinkuPoveznicom(prisma, token, LOZINKA)).rejects.toThrow("istekla");
    expect((await prijava("ivana@klijent.hr")).ok).toBe(true);

    const stara = await novaPoveznicaKlijenta(prisma, A, id);
    const nova = await novaPoveznicaKlijenta(prisma, A, id);
    await expect(postaviLozinkuPoveznicom(prisma, stara, LOZINKA)).rejects.toThrow("istekla");
    const za8dana = new Date(Date.now() + 8 * 864e5);
    await expect(postaviLozinkuPoveznicom(prisma, nova, LOZINKA, za8dana)).rejects.toThrow("istekla");
    await expect(dodajKlijentaPortala(prisma, A, partner.id, { ime: "Opet", email: "ivana@klijent.hr" })).rejects.toThrow("već ima pristup");
  });

  it("isključenje odmah odjavljuje; uključenje vraća pristup; nova lozinka odjavljuje stare sesije", async () => {
    const { A, partner } = await pripremi();
    const { id, token } = await dodajKlijentaPortala(prisma, A, partner.id, { ime: "Ivana", email: "ivana@klijent.hr" });
    await postaviLozinkuPoveznicom(prisma, token, LOZINKA);
    const s = await prijava("ivana@klijent.hr");
    if (!s.ok) throw new Error(s.greska);
    expect(await provjeriSesijuPortala(prisma, s.token)).not.toBeNull();
    await postaviAktivnostKlijenta(prisma, A, id, false);
    expect(await provjeriSesijuPortala(prisma, s.token)).toBeNull();
    expect(await prisma.sesijaPortala.count()).toBe(0);
    expect((await prijava("ivana@klijent.hr")).ok).toBe(false);
    await expect(novaLozinkaKlijenta(prisma, A, id)).rejects.toThrow("isključen");
    await postaviAktivnostKlijenta(prisma, A, id, true);
    const s2 = await prijava("ivana@klijent.hr");
    if (!s2.ok) throw new Error(s2.greska);
    const lozinka = await novaLozinkaKlijenta(prisma, A, id);
    expect(lozinka).toMatch(/^.{5}-.{5}-.{6}$/);
    expect(await provjeriSesijuPortala(prisma, s2.token)).toBeNull();
    expect((await prijava("ivana@klijent.hr", lozinka)).ok).toBe(true);
    // lozinke i tokeni nikad u dnevniku
    const dnevnik = JSON.stringify(await prisma.dnevnik.findMany({ where: { entitet: "KorisnikPortala" } }));
    expect(dnevnik).not.toContain(lozinka);
    expect(dnevnik).not.toContain(token);
    expect(dnevnik).not.toContain(LOZINKA);
  });

  it("druga firma ne upravlja tuđim klijentom ni partnerom", async () => {
    const { A, partner } = await pripremi();
    const { id } = await dodajKlijentaPortala(prisma, A, partner.id, { ime: "Ivana", email: "ivana@klijent.hr" });
    const druga = await napraviFirmu(prisma);
    const d = await napraviKorisnika(prisma, druga.id, { uloga: "Administrator" });
    const D: Akter = { firmaId: druga.id, korisnikId: d.id, prava: (await pravaClana(prisma, druga.id, d.id))! };
    await expect(postaviAktivnostKlijenta(prisma, D, id, false)).rejects.toThrow("ne postoji");
    await expect(novaLozinkaKlijenta(prisma, D, id)).rejects.toThrow("ne postoji");
    await expect(dodajKlijentaPortala(prisma, D, partner.id, { ime: "X", email: "x@x.hr" })).rejects.toThrow("Partner ne postoji");
  });
});
