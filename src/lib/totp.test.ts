import { describe, expect, it } from "vitest";
import { base32, hashRezervnog, izBase32, kodZaKorak, korak, otpauthAdresa, provjeriKod, rezervniKodovi } from "./totp";

// RFC 6238, dodatak B (SHA-1, tajna "12345678901234567890"), 8 znamenki → zadnjih 6
const TAJNA = base32(new TextEncoder().encode("12345678901234567890"));
const RFC: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
];

describe("TOTP", () => {
  it("base32 u oba smjera", () => {
    expect(base32(new TextEncoder().encode("foobar"))).toBe("MZXW6YTBOI");
    expect(new TextDecoder().decode(izBase32("mzxw 6ytb oi=="))).toBe("foobar");
  });

  it.each(RFC)("RFC 6238 vektor t=%i", (t, ocekivano) => {
    expect(kodZaKorak(TAJNA, korak(new Date(t * 1000)), 8)).toBe(ocekivano);
    expect(kodZaKorak(TAJNA, korak(new Date(t * 1000)))).toBe(ocekivano.slice(2));
  });

  it("tolerancija ±30 s; isti kod ne prolazi dvaput; stariji korak odbijen", () => {
    const sada = new Date(1111111111 * 1000);
    const k = korak(sada);
    const kod = kodZaKorak(TAJNA, k);
    expect(provjeriKod(TAJNA, kod, sada, null)).toBe(k);
    expect(provjeriKod(TAJNA, kod, sada, k)).toBeNull();
    expect(provjeriKod(TAJNA, kodZaKorak(TAJNA, k - 1), sada, null)).toBe(k - 1);
    expect(provjeriKod(TAJNA, kodZaKorak(TAJNA, k - 1), sada, k - 1)).toBeNull();
    expect(provjeriKod(TAJNA, kodZaKorak(TAJNA, k - 2), sada, null)).toBeNull();
    expect(provjeriKod(TAJNA, "12345", sada, null)).toBeNull();
    expect(provjeriKod(TAJNA, "abcdef", sada, null)).toBeNull();
  });

  it("otpauth adresa i rezervni kodovi", () => {
    expect(otpauthAdresa("ABC", "ana@firma.hr", "ERP-WMS")).toBe(
      "otpauth://totp/ERP-WMS%3Aana%40firma.hr?secret=ABC&issuer=ERP-WMS&algorithm=SHA1&digits=6&period=30",
    );
    const r = rezervniKodovi();
    expect(r).toHaveLength(10);
    expect(new Set(r).size).toBe(10);
    for (const x of r) expect(x).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hashRezervnog("abcd efgh")).toBe(hashRezervnog("ABCD-EFGH"));
  });
});
