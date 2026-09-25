import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma, TESTNA_LOZINKA } from "@/test/baza";
import { hashTokena, napraviPrvogAdmina, odjavi, odjaviSveSesije, prijavi, provjeriSesiju } from "./prijava";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");
const za = (minuta: number) => new Date(SADA.getTime() + minuta * 60_000);

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const korisnik = await napraviKorisnika(prisma, firma.id, { email: "ana@firma.hr", ime: "Ana" });
  return { firma, korisnik };
}

describe("prijava", () => {
  it("ispravna prijava daje sesiju; u bazi je samo hash tokena", async () => {
    const { firma, korisnik } = await pripremi();
    const r = await prijavi(prisma, { email: " ANA@firma.hr ", lozinka: TESTNA_LOZINKA, ip: "1.1.1.1" }, SADA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.firmaId).toBe(firma.id);
    const sesija = await prisma.sesija.findUniqueOrThrow({ where: { id: hashTokena(r.token) } });
    expect(sesija.korisnikId).toBe(korisnik.id);
    expect(await prisma.sesija.count({ where: { id: r.token } })).toBe(0);
    expect((await prisma.korisnik.findUniqueOrThrow({ where: { id: korisnik.id } })).zadnjaPrijava).toEqual(SADA);
  });

  it("kriva lozinka i nepostojeća e-pošta daju istu poruku", async () => {
    await pripremi();
    const kriva = await prijavi(prisma, { email: "ana@firma.hr", lozinka: "kriva-lozinka", ip: "1.1.1.1" }, SADA);
    const nema = await prijavi(prisma, { email: "nema@firma.hr", lozinka: TESTNA_LOZINKA, ip: "1.1.1.1" }, SADA);
    expect(kriva).toEqual({ ok: false, greska: "Neispravna e-pošta ili lozinka." });
    expect(nema).toEqual(kriva);
  });

  it("neaktivan korisnik, neaktivna firma i isključeno članstvo ne mogu se prijaviti", async () => {
    const { firma, korisnik } = await pripremi();
    const pokusaj = () => prijavi(prisma, { email: "ana@firma.hr", lozinka: TESTNA_LOZINKA, ip: "1.1.1.1" }, SADA);

    await prisma.korisnik.update({ where: { id: korisnik.id }, data: { aktivan: false } });
    expect((await pokusaj()).ok).toBe(false);
    await prisma.korisnik.update({ where: { id: korisnik.id }, data: { aktivan: true } });

    await prisma.firma.update({ where: { id: firma.id }, data: { aktivna: false } });
    expect((await pokusaj()).ok).toBe(false);
    await prisma.firma.update({ where: { id: firma.id }, data: { aktivna: true } });

    await prisma.clanstvoFirme.updateMany({ where: { korisnikId: korisnik.id }, data: { aktivno: false } });
    expect((await pokusaj()).ok).toBe(false);
  });

  it("5 pogrešnih zaključava e-poštu; i ispravna lozinka tada ne prolazi; nakon 15 min prolazi", async () => {
    await pripremi();
    for (let i = 0; i < 5; i++) {
      await prijavi(prisma, { email: "ana@firma.hr", lozinka: "kriva-lozinka", ip: `2.2.2.${i}` }, za(i));
    }
    const zakljucano = await prijavi(prisma, { email: "ana@firma.hr", lozinka: TESTNA_LOZINKA, ip: "3.3.3.3" }, za(5));
    expect(zakljucano).toEqual({ ok: false, greska: expect.stringContaining("Previše neuspjelih") });
    const kasnije = await prijavi(prisma, { email: "ana@firma.hr", lozinka: TESTNA_LOZINKA, ip: "3.3.3.3" }, za(15.1));
    expect(kasnije.ok).toBe(true);
  });

  it("20 pogrešnih s istog IP-a zaključava taj IP i za druge e-pošte", async () => {
    await pripremi();
    for (let i = 0; i < 20; i++) {
      await prijavi(prisma, { email: `x${i}@firma.hr`, lozinka: "kriva-lozinka", ip: "6.6.6.6" }, za(i * 0.1));
    }
    const s_ip = await prijavi(prisma, { email: "ana@firma.hr", lozinka: TESTNA_LOZINKA, ip: "6.6.6.6" }, za(3));
    expect(s_ip.ok).toBe(false);
    const drugi_ip = await prijavi(prisma, { email: "ana@firma.hr", lozinka: TESTNA_LOZINKA, ip: "7.7.7.7" }, za(3));
    expect(drugi_ip.ok).toBe(true);
  });

  it("10 istovremenih pogrešnih pokušaja ne prelazi ograničenje (zapiše se najviše 5)", async () => {
    await pripremi();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        prijavi(prisma, { email: "ana@firma.hr", lozinka: "kriva-lozinka", ip: `4.4.4.${i}` }, SADA),
      ),
    );
    expect(await prisma.pokusajPrijave.count({ where: { email: "ana@firma.hr", uspjeh: false } })).toBe(5);
  });
});

describe("sesija", () => {
  async function prijavljen() {
    const p = await pripremi();
    const r = await prijavi(prisma, { email: "ana@firma.hr", lozinka: TESTNA_LOZINKA, ip: "1.1.1.1" }, SADA);
    if (!r.ok) throw new Error(r.greska);
    return { ...p, token: r.token };
  }

  it("valjana sesija vraća korisnika i firmu", async () => {
    const { token, firma } = await prijavljen();
    const s = await provjeriSesiju(prisma, token, za(1));
    expect(s?.korisnik.ime).toBe("Ana");
    expect(s?.firma.id).toBe(firma.id);
  });

  it("nepoznat ili izmišljen token: nema sesije", async () => {
    await prijavljen();
    expect(await provjeriSesiju(prisma, "izmisljeno", za(1))).toBeNull();
    expect(await provjeriSesiju(prisma, "", za(1))).toBeNull();
  });

  it("nakon 14 dana neaktivnosti sesija istječe i briše se", async () => {
    const { token } = await prijavljen();
    expect(await provjeriSesiju(prisma, token, za(14 * 24 * 60))).toBeNull();
    expect(await prisma.sesija.count()).toBe(0);
  });

  it("aktivnost produljuje sesiju (najviše jednom na sat)", async () => {
    const { token } = await prijavljen();
    await provjeriSesiju(prisma, token, za(30));
    let s = await prisma.sesija.findFirstOrThrow();
    expect(s.zadnjaAktivnost).toEqual(SADA);
    await provjeriSesiju(prisma, token, za(13 * 24 * 60));
    s = await prisma.sesija.findFirstOrThrow();
    expect(s.zadnjaAktivnost).toEqual(za(13 * 24 * 60));
    // 13 dana kasnije od zadnje aktivnosti još vrijedi
    expect(await provjeriSesiju(prisma, token, za(26 * 24 * 60))).not.toBeNull();
  });

  it("isključenje korisnika odmah prekida sesiju", async () => {
    const { token, korisnik } = await prijavljen();
    await prisma.korisnik.update({ where: { id: korisnik.id }, data: { aktivan: false } });
    expect(await provjeriSesiju(prisma, token, za(1))).toBeNull();
  });

  it("isključenje članstva u firmi odmah prekida sesiju", async () => {
    const { token, korisnik } = await prijavljen();
    await prisma.clanstvoFirme.updateMany({ where: { korisnikId: korisnik.id }, data: { aktivno: false } });
    expect(await provjeriSesiju(prisma, token, za(1))).toBeNull();
  });

  it("odjava briše sesiju u bazi", async () => {
    const { token } = await prijavljen();
    await odjavi(prisma, token);
    expect(await provjeriSesiju(prisma, token, za(1))).toBeNull();
    expect(await prisma.sesija.count()).toBe(0);
  });

  it("odjava sa svih uređaja", async () => {
    const { korisnik } = await prijavljen();
    await prijavi(prisma, { email: "ana@firma.hr", lozinka: TESTNA_LOZINKA, ip: "1.1.1.2" }, za(1));
    expect(await odjaviSveSesije(prisma, korisnik.id)).toBe(2);
  });
});

describe("prvi administrator", () => {
  const ulaz = { nazivFirme: "Moja firma d.o.o.", oib: "69435151530", ime: "Admin", email: "Admin@Firma.hr", lozinka: "Vrlo-dobra-lozinka" };

  it("napravi firmu, korisnika i članstvo; e-pošta je normalizirana", async () => {
    const { firmaId, korisnikId } = await napraviPrvogAdmina(prisma, ulaz);
    const k = await prisma.korisnik.findUniqueOrThrow({ where: { id: korisnikId } });
    expect(k.email).toBe("admin@firma.hr");
    expect(await prisma.clanstvoFirme.count({ where: { firmaId, korisnikId } })).toBe(1);
    const r = await prijavi(prisma, { email: "admin@firma.hr", lozinka: ulaz.lozinka, ip: "1.1.1.1" });
    expect(r.ok).toBe(true);
  });

  it("odbija ako korisnici već postoje", async () => {
    await napraviPrvogAdmina(prisma, ulaz);
    await expect(napraviPrvogAdmina(prisma, { ...ulaz, email: "drugi@firma.hr", oib: "94577403194" })).rejects.toThrow(/već postoje/);
  });

  it("odbija slabu lozinku", async () => {
    await expect(napraviPrvogAdmina(prisma, { ...ulaz, lozinka: "kratka" })).rejects.toThrow(/najmanje 10/);
    expect(await prisma.firma.count()).toBe(0);
  });
});
