import { describe, expect, it } from "vitest";
import {
  istekSesije,
  jeEmail,
  kolacicSecure,
  normalizirajEmail,
  odluciOPrijavi,
  porukaZakljucano,
  sigurnaPutanja,
  provjeriNovuLozinku,
  trebaProduljitiSesiju,
  type Pokusaj,
} from "./prijava";

const SADA = new Date("2026-09-25T12:00:00Z");
const minutaPrije = (m: number) => new Date(SADA.getTime() - m * 60_000);
const pogresni = (...minute: number[]): Pokusaj[] => minute.map((m) => ({ vrijeme: minutaPrije(m), uspjeh: false }));

describe("odluciOPrijavi — po e-pošti", () => {
  it("4 pogrešna u 15 min: dopušteno", () => {
    expect(odluciOPrijavi(pogresni(1, 2, 3, 4), [], SADA)).toEqual({ dopusteno: true });
  });

  it("5 pogrešnih u 15 min: zaključano 15 min od najstarijeg od njih", () => {
    const r = odluciOPrijavi(pogresni(1, 2, 3, 4, 10), [], SADA);
    expect(r).toEqual({ dopusteno: false, zakljucanoDo: new Date(minutaPrije(10).getTime() + 15 * 60_000), razlog: "email" });
  });

  it("pogrešni stariji od 15 min se ne broje", () => {
    expect(odluciOPrijavi(pogresni(1, 2, 3, 4, 16), [], SADA)).toEqual({ dopusteno: true });
  });

  it("uspješna prijava briše raniji niz pogrešnih", () => {
    const pokusaji = [...pogresni(10, 9, 8, 7), { vrijeme: minutaPrije(6), uspjeh: true }, ...pogresni(5)];
    expect(odluciOPrijavi(pokusaji, [], SADA)).toEqual({ dopusteno: true });
  });

  it("zaključavanje prestaje točno nakon 15 min", () => {
    const pokusaji = pogresni(15, 14, 13, 12, 11);
    // najstariji je točno na rubu prozora — više se ne broji
    expect(odluciOPrijavi(pokusaji, [], SADA)).toEqual({ dopusteno: true });
  });
});

describe("odluciOPrijavi — po IP-u", () => {
  it("20 pogrešnih s istog IP-a (različite e-pošte) zaključava IP", () => {
    const poIp = pogresni(...Array.from({ length: 20 }, (_, i) => i * 0.5 + 0.1));
    const r = odluciOPrijavi([], poIp, SADA);
    expect(r.dopusteno).toBe(false);
    if (!r.dopusteno) expect(r.razlog).toBe("ip");
  });

  it("19 pogrešnih: dopušteno", () => {
    const poIp = pogresni(...Array.from({ length: 19 }, (_, i) => i * 0.5 + 0.1));
    expect(odluciOPrijavi([], poIp, SADA)).toEqual({ dopusteno: true });
  });

  it("uspjeh s IP-a ne briše IP brojač (napadač s jednim ispravnim računom)", () => {
    const poIp = [...pogresni(...Array.from({ length: 20 }, (_, i) => i * 0.5 + 0.1)), { vrijeme: minutaPrije(0.1), uspjeh: true }];
    expect(odluciOPrijavi([], poIp, SADA).dopusteno).toBe(false);
  });

  it("kad su zaključani i e-pošta i IP, javlja se kasnije vrijeme", () => {
    const poEmailu = pogresni(1, 2, 3, 4, 5);
    const poIp = pogresni(...Array.from({ length: 20 }, (_, i) => i * 0.7));
    const r = odluciOPrijavi(poEmailu, poIp, SADA);
    expect(r.dopusteno).toBe(false);
    if (!r.dopusteno) expect(r.zakljucanoDo).toEqual(new Date(minutaPrije(5).getTime() + 15 * 60_000));
  });
});

describe("lozinka", () => {
  it.each([
    ["kratka", "a@b.hr", "najmanje 10"],
    ["a@b.hr1234", "A@b.hr1234", "e-pošti"],
    ["aaaaaaaaaaaa", "a@b.hr", "ponovljen"],
    [" razmak-na-pocetku", "a@b.hr", "razmakom"],
    ["x".repeat(73), "a@b.hr", "preduga"],
    ["č".repeat(40), "a@b.hr", "preduga"],
  ])("„%s“ → greška", (lozinka, email, dio) => {
    expect(provjeriNovuLozinku(lozinka, email)).toContain(dio);
  });

  it("dobra lozinka prolazi", () => {
    expect(provjeriNovuLozinku("Skladiste-2026", "a@b.hr")).toBeNull();
    expect(provjeriNovuLozinku("xy".repeat(36), "a@b.hr")).toBeNull();
  });
});

describe("e-pošta", () => {
  it("normalizira", () => {
    expect(normalizirajEmail("  Ana.Horvat@Firma.HR ")).toBe("ana.horvat@firma.hr");
  });
  it.each([
    ["a@b.hr", true],
    ["a@b", false],
    ["a b@c.hr", false],
    ["", false],
    ["@b.hr", false],
  ])("%s → %s", (e, ok) => {
    expect(jeEmail(e)).toBe(ok);
  });
});

describe("sesija", () => {
  it("istječe 14 dana od aktivnosti", () => {
    expect(istekSesije(SADA)).toEqual(new Date("2026-10-09T12:00:00Z"));
  });
  it("produljuje se najviše jednom na sat", () => {
    expect(trebaProduljitiSesiju(minutaPrije(59), SADA)).toBe(false);
    expect(trebaProduljitiSesiju(minutaPrije(60), SADA)).toBe(true);
  });
});

describe("kolačić Secure", () => {
  it.each([
    ["https", true],
    ["http", false],
    ["HTTPS", true],
    ["https, http", true],
    ["http, https", false],
    [null, false],
    ["", false],
  ])("protokol %s → %s", (protokol, ocekivano) => {
    expect(kolacicSecure(protokol)).toBe(ocekivano);
  });

  it("način uvijek/nikad ima prednost", () => {
    expect(kolacicSecure("http", "uvijek")).toBe(true);
    expect(kolacicSecure("https", "nikad")).toBe(false);
  });
});

describe("poruka zaključavanja", () => {
  it("zaokružuje minute prema gore", () => {
    expect(porukaZakljucano(new Date(SADA.getTime() + 61_000), SADA)).toContain("2 min");
    expect(porukaZakljucano(new Date(SADA.getTime() + 1_000), SADA)).toContain("1 min");
  });
});

describe("sigurnaPutanja", () => {
  it.each([
    ["/uredaji?stranica=2", "/uredaji?stranica=2"],
    [null, "/"],
    ["", "/"],
    ["https://zlo.com", "/"],
    ["//zlo.com", "/"],
    ["/\\zlo.com", "/"],
    ["uredaji", "/"],
    ["/prijava", "/"],
    ["/a\r\nb", "/"],
  ])("%s → %s", (ulaz, izlaz) => {
    expect(sigurnaPutanja(ulaz)).toBe(izlaz);
  });
});
