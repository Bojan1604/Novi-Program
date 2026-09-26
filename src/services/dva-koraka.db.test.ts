import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kodZaKorak, korak } from "@/lib/totp";
import { napraviFirmu, napraviKorisnika, ocistiBazu, TESTNA_LOZINKA, testnaPrisma } from "@/test/baza";
import { iskljuciDvaKoraka, noviRezervniKodovi, potvrdiDvaKoraka, stanjeDvaKoraka, zapocniDvaKoraka } from "./dva-koraka";
import { pravaClana, type Akter } from "./korisnici";
import { dovrsiPrijavu, prijavi } from "./prijava";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const T0 = new Date("2026-09-26T10:00:00Z");
const za = (s: number) => new Date(T0.getTime() + s * 1000);

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const k = await napraviKorisnika(prisma, firma.id, { email: "ana@firma.hr" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  return { A };
}
const lozinka = (sada: Date, ip = "1.1.1.1") => prijavi(prisma, { email: "ana@firma.hr", lozinka: TESTNA_LOZINKA, ip }, sada);

async function ukljuci(A: Akter) {
  await expect(zapocniDvaKoraka(prisma, A, "kriva-lozinka")).rejects.toThrow("Lozinka");
  const { tajna, adresa } = await zapocniDvaKoraka(prisma, A, TESTNA_LOZINKA);
  expect(adresa).toContain(`secret=${tajna}`);
  expect((await prisma.korisnik.findUniqueOrThrow({ where: { id: A.korisnikId } })).totpTajna).not.toContain(tajna);
  await expect(potvrdiDvaKoraka(prisma, A, "000000", T0)).rejects.toThrow("Kod nije ispravan");
  const kodovi = await potvrdiDvaKoraka(prisma, A, kodZaKorak(tajna, korak(T0)), T0);
  return { tajna, kodovi };
}

describe("prijava u dva koraka", () => {
  it("uključivanje traži lozinku i kod; nakon lozinke nema sesije dok se ne upiše kod; isti kod ne prolazi dvaput", async () => {
    const { A } = await pripremi();
    const { tajna, kodovi } = await ukljuci(A);
    expect(kodovi).toHaveLength(10);
    expect(await stanjeDvaKoraka(prisma, A.korisnikId)).toEqual({ ukljucen: true, preostaloRezervnih: 10 });

    const prvi = await lozinka(za(5));
    expect(prvi.ok).toBe(false);
    if (prvi.ok || !prvi.drugiKorak) throw new Error("očekivan drugi korak");
    expect(await prisma.sesija.count()).toBe(0);
    // kod korišten pri uključivanju (isti korak) ne prolazi
    expect(await dovrsiPrijavu(prisma, { drugiKorak: prvi.drugiKorak, kod: kodZaKorak(tajna, korak(T0)), ip: "1.1.1.1" }, za(5))).toEqual({
      ok: false,
      greska: "Kod nije ispravan.",
    });
    const noviKod = kodZaKorak(tajna, korak(za(30)));
    const r = await dovrsiPrijavu(prisma, { drugiKorak: prvi.drugiKorak, kod: noviKod, ip: "1.1.1.1" }, za(31));
    expect(r.ok).toBe(true);
    expect(await prisma.sesija.count()).toBe(1);
    // token drugog koraka je potrošen; isti kod u novoj prijavi ne prolazi
    expect((await dovrsiPrijavu(prisma, { drugiKorak: prvi.drugiKorak, kod: noviKod, ip: "1.1.1.1" }, za(32))).ok).toBe(false);
    const drugi = await lozinka(za(40));
    if (drugi.ok || !drugi.drugiKorak) throw new Error("očekivan drugi korak");
    expect(await dovrsiPrijavu(prisma, { drugiKorak: drugi.drugiKorak, kod: noviKod, ip: "1.1.1.1" }, za(41))).toEqual({
      ok: false,
      greska: "Kod nije ispravan.",
    });
  });

  it("rezervni kod vrijedi jednom; 5 krivih kodova i istek poništavaju prijavu", async () => {
    const { A } = await pripremi();
    const { kodovi } = await ukljuci(A);
    const p = await lozinka(za(5));
    if (p.ok || !p.drugiKorak) throw new Error("očekivan drugi korak");
    expect((await dovrsiPrijavu(prisma, { drugiKorak: p.drugiKorak, kod: kodovi[0]!.toLowerCase(), ip: "1.1.1.1" }, za(6))).ok).toBe(true);
    const p2 = await lozinka(za(10));
    if (p2.ok || !p2.drugiKorak) throw new Error("očekivan drugi korak");
    expect((await dovrsiPrijavu(prisma, { drugiKorak: p2.drugiKorak, kod: kodovi[0]!, ip: "1.1.1.1" }, za(11))).ok).toBe(false);
    for (let i = 0; i < 4; i++) await dovrsiPrijavu(prisma, { drugiKorak: p2.drugiKorak, kod: "111111", ip: "1.1.1.1" }, za(12));
    expect(await dovrsiPrijavu(prisma, { drugiKorak: p2.drugiKorak, kod: kodovi[1]!, ip: "1.1.1.1" }, za(13))).toMatchObject({
      ok: false,
      greska: expect.stringMatching(/istekla/),
    });
    // krivi kodovi su pogrešne prijave: odmah nakon njih račun je privremeno zaključan, poslije prozora opet radi
    expect(await lozinka(za(20))).toMatchObject({ ok: false, greska: expect.stringMatching(/zaključan|pokušaj/i) });
    const p3 = await lozinka(za(1000));
    if (p3.ok || !p3.drugiKorak) throw new Error("očekivan drugi korak");
    expect(await dovrsiPrijavu(prisma, { drugiKorak: p3.drugiKorak, kod: kodovi[1]!, ip: "1.1.1.1" }, za(1000 + 6 * 60))).toMatchObject({
      greska: expect.stringMatching(/istekla/),
    });
    expect(await stanjeDvaKoraka(prisma, A.korisnikId)).toMatchObject({ preostaloRezervnih: 9 });
  });

  it("napad s poznatom lozinkom: nova prijava ne daje nove pokušaje koda (zaključavanje kao za lozinku)", async () => {
    const { A } = await pripremi();
    const { tajna } = await ukljuci(A);
    let t = 100;
    let pokusaja = 0;
    let zakljucano = false;
    for (let krug = 0; krug < 5 && !zakljucano; krug++) {
      const p = await lozinka(za(t++));
      if (p.ok) throw new Error("bez koda nema sesije");
      if (!p.drugiKorak) {
        zakljucano = true;
        break;
      }
      for (let i = 0; i < 5; i++) {
        const r = await dovrsiPrijavu(prisma, { drugiKorak: p.drugiKorak, kod: "000001", ip: "1.1.1.1" }, za(t++));
        if (r.ok) throw new Error("krivi kod prošao");
        pokusaja++;
      }
    }
    expect(zakljucano).toBe(true);
    expect(pokusaja).toBeLessThanOrEqual(10);
    // ni točan kod ne prolazi dok je zaključano (lozinka se ne može ni upisati)
    expect(await lozinka(za(t++))).toMatchObject({ ok: false });
    void tajna;
  });

  it("ponovna provjera lozinke (Moj račun) ima isto ograničenje pokušaja", async () => {
    const { A } = await pripremi();
    for (let i = 0; i < 5; i++) await expect(zapocniDvaKoraka(prisma, { ...A, ip: "2.2.2.2" }, "kriva")).rejects.toThrow("Lozinka nije ispravna");
    await expect(zapocniDvaKoraka(prisma, { ...A, ip: "2.2.2.2" }, TESTNA_LOZINKA)).rejects.toThrow(/zaključan|pokušaj/i);
  });

  it("novi rezervni kodovi poništavaju stare; isključivanje traži lozinku i kod", async () => {
    const { A } = await pripremi();
    const { tajna, kodovi } = await ukljuci(A);
    const novi = await noviRezervniKodovi(prisma, A, TESTNA_LOZINKA);
    expect(novi).not.toEqual(kodovi);
    await expect(iskljuciDvaKoraka(prisma, A, TESTNA_LOZINKA, kodovi[0]!, za(60))).rejects.toThrow("Kod nije ispravan");
    await expect(iskljuciDvaKoraka(prisma, A, "kriva", kodZaKorak(tajna, korak(za(60))), za(60))).rejects.toThrow("Lozinka");
    await iskljuciDvaKoraka(prisma, A, TESTNA_LOZINKA, kodZaKorak(tajna, korak(za(60))), za(60));
    expect((await lozinka(za(70))).ok).toBe(true);
    expect(await prisma.dnevnik.count({ where: { radnja: "racun.dva-koraka" } })).toBe(3);
  });
});
