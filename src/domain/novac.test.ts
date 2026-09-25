import { describe, expect, it } from "vitest";
import { centiIzDecimala, centiUDecimal, formatirajIznos, procitajIznos, zbroji } from "./novac";

describe("procitajIznos — ispravni upisi", () => {
  it.each([
    ["0", 0],
    ["0,5", 50],
    ["0,50", 50],
    ["1", 100],
    ["1500", 150000],
    ["1.500", 150000],
    ["1.500,5", 150050],
    ["1.500,50", 150050],
    ["1.234.567,89", 123456789],
    ["1 500", 150000],
    ["1 500,00", 150000],
    ["1 500,00", 150000],
    ["  12,30  ", 1230],
    ["120 €", 12000],
    ["120,00€", 12000],
    ["120 EUR", 12000],
    ["-0", 0],
  ])("„%s“ → %i centi", (upis, ocekivano) => {
    expect(procitajIznos(upis)).toEqual({ ok: true, vrijednost: ocekivano });
  });

  it("negativan iznos samo kad je dopušten", () => {
    expect(procitajIznos("-1.500,50", { dopustiNegativno: true })).toEqual({ ok: true, vrijednost: -150050 });
    expect(procitajIznos("-1.500,50").ok).toBe(false);
  });
});

describe("procitajIznos — neispravni upisi nikad nisu 0", () => {
  it.each([
    [""],
    ["   "],
    ["abc"],
    ["12abc"],
    ["1.5"],
    ["1.50"],
    ["1,505"],
    ["1,"],
    [",50"],
    ["1,2,3"],
    ["1.50.000"],
    ["1500.000"],
    ["1.500 000"],
    ["12.34,5"],
    ["1e3"],
    ["0x10"],
    ["+5"],
    ["--5"],
    ["99999999999999"],
  ])("„%s“ → greška", (upis) => {
    const r = procitajIznos(upis);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.greska.length).toBeGreaterThan(0);
  });

  it("točka s decimalama daje uputu o zarezu", () => {
    const r = procitajIznos("1.50");
    expect(r).toEqual({ ok: false, greska: expect.stringContaining("zarez") });
  });
});

describe("formatirajIznos", () => {
  it.each([
    [0, "0,00"],
    [5, "0,05"],
    [150050, "1.500,50"],
    [123456789, "1.234.567,89"],
    [-150050, "-1.500,50"],
  ])("%i → „%s“", (centi, ocekivano) => {
    expect(formatirajIznos(centi)).toBe(ocekivano);
  });

  it("s valutom", () => {
    expect(formatirajIznos(12000, true)).toBe("120,00 €");
  });

  it("odbija iznos koji nije cijeli broj centi", () => {
    expect(() => formatirajIznos(10.5)).toThrow();
  });

  it("upis → ispis → upis daje isti iznos", () => {
    for (const centi of [0, 1, 99, 100, 150050, 123456789]) {
      expect(procitajIznos(formatirajIznos(centi))).toEqual({ ok: true, vrijednost: centi });
    }
  });
});

describe("pretvorba s bazom (Decimal)", () => {
  it.each([
    ["0", 0],
    ["1500", 150000],
    ["1500.5", 150050],
    ["1500.50", 150050],
    ["-0.01", -1],
  ])("„%s“ → %i", (decimal, centi) => {
    expect(centiIzDecimala(decimal)).toBe(centi);
  });

  it.each([["1500.505"], ["abc"], [""], ["1,5"]])("„%s“ → greška", (decimal) => {
    expect(() => centiIzDecimala(decimal)).toThrow();
  });

  it.each([
    [0, "0.00"],
    [1, "0.01"],
    [150050, "1500.50"],
    [-1, "-0.01"],
  ])("%i → „%s“", (centi, decimal) => {
    expect(centiUDecimal(centi)).toBe(decimal);
    expect(centiIzDecimala(centiUDecimal(centi))).toBe(centi);
  });
});

describe("zbroji", () => {
  it("zbraja cente bez greške zaokruživanja", () => {
    // 0,10 + 0,20 u floatu je 0,30000000000000004; u centima je točno 30
    expect(zbroji([10, 20])).toBe(30);
    expect(zbroji(Array.from({ length: 1000 }, () => 1))).toBe(1000);
    expect(zbroji([])).toBe(0);
  });

  it("odbija necijele cente", () => {
    expect(() => zbroji([10, 0.5])).toThrow();
  });
});
