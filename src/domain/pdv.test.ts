import { describe, expect, it } from "vitest";
import {
  cijenaBezPdv,
  izracunaj,
  kategorijaPdv,
  napomenePdv,
  podijeliZaokruzi,
  TEKSTOVI_OSLOBODJENJA,
  type KodKategorije,
  type StavkaZaZbroj,
} from "./pdv";

const K = (kod: KodKategorije = "HR", stopa = 2500) => ({ kod, stopa });
/** kolicina u komadima (može decimalno), cijena u eurima kao tekst — pretvorba samo za čitljivost tablice */
const s = (kol: number, cijena: number, popust = 0, kat = K()): StavkaZaZbroj => ({
  kolicina: Math.round(kol * 1000),
  cijena: Math.round(cijena * 100),
  popust: Math.round(popust * 100),
  kategorija: kat,
});

/**
 * Ručno izračunati primjeri (osnovica, PDV, ukupno u centima). Svaki redak je izračunat na papiru:
 * iznos stavke = kol × cijena × (1 − popust) × (1 − popust dokumenta) → zaokruži na cent; PDV po kategoriji na zbroj.
 */
const PRIMJERI: { opis: string; stavke: StavkaZaZbroj[]; popustDok?: number; osnovica: number; pdv: number; ukupno: number }[] = [
  { opis: "1 × 100,00 uz 25 %", stavke: [s(1, 100)], osnovica: 10000, pdv: 2500, ukupno: 12500 },
  { opis: "2 × 999,99: PDV 499,995 → 500,00", stavke: [s(2, 999.99)], osnovica: 199998, pdv: 50000, ukupno: 249998 },
  { opis: "3 × 33,33: PDV 24,9975 → 25,00", stavke: [s(3, 33.33)], osnovica: 9999, pdv: 2500, ukupno: 12499 },
  { opis: "popust stavke 10 %", stavke: [s(1, 100, 10)], osnovica: 9000, pdv: 2250, ukupno: 11250 },
  { opis: "99,99 − 15 % = 84,9915 → 84,99; PDV 21,2475 → 21,25", stavke: [s(1, 99.99, 15)], osnovica: 8499, pdv: 2125, ukupno: 10624 },
  { opis: "1,5 h × 40,00", stavke: [s(1.5, 40)], osnovica: 6000, pdv: 1500, ukupno: 7500 },
  { opis: "0,333 × 10,00 = 3,33; PDV 0,8325 → 0,83", stavke: [s(0.333, 10)], osnovica: 333, pdv: 83, ukupno: 416 },
  { opis: "13 %: 10,00", stavke: [s(1, 10, 0, K("HR", 1300))], osnovica: 1000, pdv: 130, ukupno: 1130 },
  { opis: "5 %: 10,01 → PDV 0,5005 → 0,50", stavke: [s(1, 10.01, 0, K("HR", 500))], osnovica: 1001, pdv: 50, ukupno: 1051 },
  { opis: "popust dokumenta 5 %", stavke: [s(1, 100)], popustDok: 5, osnovica: 9500, pdv: 2375, ukupno: 11875 },
  {
    opis: "10 % stavke + 5 % dokumenta = 85,50; PDV 21,375 → 21,38",
    stavke: [s(1, 100, 10)],
    popustDok: 5,
    osnovica: 8550,
    pdv: 2138,
    ukupno: 10688,
  },
  { opis: "PDV na zbroj kategorije: 0,10 + 0,10 → PDV 0,05 (ne 0,03 + 0,03)", stavke: [s(1, 0.1), s(1, 0.1)], osnovica: 20, pdv: 5, ukupno: 25 },
  { opis: "dvije stope: 100 @25 % + 10 @13 %", stavke: [s(1, 100), s(1, 10, 0, K("HR", 1300))], osnovica: 11000, pdv: 2630, ukupno: 13630 },
  { opis: "isporuka u EU bez PDV-a", stavke: [s(1, 500, 0, K("EU_ROBA", 0))], osnovica: 50000, pdv: 0, ukupno: 50000 },
  { opis: "storno −1 × 100,00", stavke: [s(-1, 100)], osnovica: -10000, pdv: -2500, ukupno: -12500 },
  { opis: "storno −0,10: PDV −0,025 → −0,03 (pola od nule)", stavke: [s(-1, 0.1)], osnovica: -10, pdv: -3, ukupno: -13 },
  { opis: "popust 100 %", stavke: [s(1, 100, 100)], osnovica: 0, pdv: 0, ukupno: 0 },
  { opis: "popust 33,33 %: 66,67; PDV 16,6675 → 16,67", stavke: [s(1, 100, 33.33)], osnovica: 6667, pdv: 1667, ukupno: 8334 },
  { opis: "1000 × 1.234,56", stavke: [s(1000, 1234.56)], osnovica: 123456000, pdv: 30864000, ukupno: 154320000 },
  {
    opis: "5000 × 99.999,99 (veliki iznosi bez gubitka točnosti)",
    stavke: [s(5000, 99999.99)],
    osnovica: 49999995000,
    pdv: 12499998750,
    ukupno: 62499993750,
  },
  { opis: "0,01 uz 25 %: PDV 0,0025 → 0", stavke: [s(1, 0.01)], osnovica: 1, pdv: 0, ukupno: 1 },
  { opis: "0,02 uz 25 %: PDV 0,005 → 0,01", stavke: [s(1, 0.02)], osnovica: 2, pdv: 1, ukupno: 3 },
  { opis: "HR 25 % + usluga u EU", stavke: [s(1, 100), s(1, 50, 0, K("EU_USLUGA", 0))], osnovica: 15000, pdv: 2500, ukupno: 17500 },
  {
    opis: "popust dokumenta 10 % na dvije stope",
    stavke: [s(1, 100), s(1, 100, 0, K("HR", 1300))],
    popustDok: 10,
    osnovica: 18000,
    pdv: 3420,
    ukupno: 21420,
  },
  { opis: "2,5 × 0,99 = 2,475 → 2,48; PDV 0,62", stavke: [s(2.5, 0.99)], osnovica: 248, pdv: 62, ukupno: 310 },
  { opis: "3 × 19,99 − 12,5 % = 52,47375 → 52,47; PDV 13,1175 → 13,12", stavke: [s(3, 19.99, 12.5)], osnovica: 5247, pdv: 1312, ukupno: 6559 },
  { opis: "1,00 − 2,5 % dokumenta = 0,975 → 0,98; PDV 0,245 → 0,25", stavke: [s(1, 1)], popustDok: 2.5, osnovica: 98, pdv: 25, ukupno: 123 },
  { opis: "bez stavki", stavke: [], osnovica: 0, pdv: 0, ukupno: 0 },
  { opis: "odobrenje dijela: 100 − 30", stavke: [s(1, 100), s(-1, 30)], osnovica: 7000, pdv: 1750, ukupno: 8750 },
  { opis: "nije u sustavu PDV-a", stavke: [s(2, 45.5, 0, K("NIJE_U_SUSTAVU", 0))], osnovica: 9100, pdv: 0, ukupno: 9100 },
  {
    opis: "izvoz + usluga izvan EU",
    stavke: [s(1, 700, 0, K("IZVOZ", 0)), s(2, 25, 0, K("TRECE_USLUGA", 0))],
    osnovica: 75000,
    pdv: 0,
    ukupno: 75000,
  },
  { opis: "0 % domaća stopa", stavke: [s(4, 2.5, 0, K("HR", 0))], osnovica: 1000, pdv: 0, ukupno: 1000 },
  { opis: "tri stavke iste stope, različiti popusti", stavke: [s(1, 10, 10), s(2, 5, 50), s(1, 3.33)], osnovica: 1733, pdv: 433, ukupno: 2166 },
];

describe("zbrojevi — tablica ručno izračunatih primjera", () => {
  it(`ima barem 30 primjera (${PRIMJERI.length})`, () => expect(PRIMJERI.length).toBeGreaterThanOrEqual(30));
  for (const p of PRIMJERI) {
    it(p.opis, () => {
      const r = izracunaj(p.stavke, Math.round((p.popustDok ?? 0) * 100));
      expect({ osnovica: r.osnovica, pdv: r.pdv, ukupno: r.ukupno }).toEqual({ osnovica: p.osnovica, pdv: p.pdv, ukupno: p.ukupno });
      // zbroj stavki = osnovica; bruto − popust = osnovica
      expect(r.stavke.reduce((a, x) => a + x.iznos, 0)).toBe(r.osnovica);
      expect(r.bruto - r.popust).toBe(r.osnovica);
    });
  }
});

describe("zbrojevi — pojedinosti", () => {
  it("po kategoriji: redom od najveće stope", () => {
    const r = izracunaj([s(1, 10, 0, K("HR", 1300)), s(1, 100), s(1, 50, 0, K("EU_USLUGA", 0))]);
    expect(r.poKategoriji).toEqual([
      { kod: "HR", stopa: 2500, osnovica: 10000, pdv: 2500 },
      { kod: "HR", stopa: 1300, osnovica: 1000, pdv: 130 },
      { kod: "EU_USLUGA", stopa: 0, osnovica: 5000, pdv: 0 },
    ]);
  });
  it("popust stavke u iznosu", () => {
    expect(izracunaj([s(1, 99.99, 15)]).stavke[0]).toEqual({ bruto: 9999, popust: 1500, iznos: 8499 });
  });
  it("neispravan popust i količina odbijeni", () => {
    expect(() => izracunaj([s(1, 1, 101)])).toThrow("Popust stavke");
    expect(() => izracunaj([s(1, 1)], -1)).toThrow("Popust dokumenta");
    expect(() => izracunaj([{ ...s(1, 1), kolicina: 1.5 }])).toThrow("cijeli brojevi");
  });
  it("zaokruživanje pola od nule", () => {
    expect(podijeliZaokruzi(5n, 2n)).toBe(3n);
    expect(podijeliZaokruzi(-5n, 2n)).toBe(-3n);
    expect(podijeliZaokruzi(4n, 3n)).toBe(1n);
    expect(podijeliZaokruzi(-4n, 3n)).toBe(-1n);
  });
  it("cijena bez PDV-a iz maloprodajne", () => {
    expect(cijenaBezPdv(12500, 2500)).toBe(10000);
    expect(cijenaBezPdv(9999, 2500)).toBe(7999);
    expect(cijenaBezPdv(1000, 1300)).toBe(885);
  });
});

describe("kategorija PDV-a", () => {
  const k = (statusKupca: Parameters<typeof kategorijaPdv>[0]["statusKupca"], vrsta: "ROBA" | "USLUGA", firmaUSustavuPdv = true, stopa = 2500) =>
    kategorijaPdv({ firmaUSustavuPdv, statusKupca, vrsta, stopa });
  it("domaći kupac i građanin EU: hrvatski PDV po stopi artikla", () => {
    expect(k("DOMACI", "ROBA")).toMatchObject({ kod: "HR", stopa: 2500, ublKod: "S", oslobodjenje: null });
    expect(k("DOMACI", "USLUGA", true, 1300)).toMatchObject({ kod: "HR", stopa: 1300 });
    expect(k("EU_NEOBVEZNIK", "USLUGA")).toMatchObject({ kod: "HR", stopa: 2500 });
    expect(k("DOMACI", "ROBA", true, 0)).toMatchObject({ kod: "HR", stopa: 0, ublKod: "Z" });
    expect(k("DOMACI", "ROBA", true, 1700)).toMatchObject({ stopa: 2500 });
  });
  it("EU obveznik: roba oslobođena (K), usluga i najam prijenos obveze (AE)", () => {
    expect(k("EU_OBVEZNIK", "ROBA")).toMatchObject({ kod: "EU_ROBA", stopa: 0, ublKod: "K", oslobodjenje: { tekst: TEKSTOVI_OSLOBODJENJA.EU_ROBA } });
    expect(k("EU_OBVEZNIK", "USLUGA")).toMatchObject({ kod: "EU_USLUGA", stopa: 0, ublKod: "AE" });
  });
  it("treća zemlja: izvoz robe (G), usluga izvan oporezivanja (O)", () => {
    expect(k("TRECA_ZEMLJA", "ROBA")).toMatchObject({ kod: "IZVOZ", ublKod: "G" });
    expect(k("TRECA_ZEMLJA", "USLUGA")).toMatchObject({ kod: "TRECE_USLUGA", ublKod: "O" });
  });
  it("firma izvan sustava PDV-a: uvijek bez PDV-a s napomenom", () => {
    for (const st of ["DOMACI", "EU_OBVEZNIK", "TRECA_ZEMLJA"] as const)
      expect(k(st, "ROBA", false)).toMatchObject({ kod: "NIJE_U_SUSTAVU", stopa: 0 });
  });
  it("napomene bez ponavljanja; naplaćena naknada samo uz hrvatski PDV", () => {
    const eu = k("EU_OBVEZNIK", "ROBA");
    expect(napomenePdv([eu, eu], true)).toEqual([TEKSTOVI_OSLOBODJENJA.EU_ROBA]);
    expect(napomenePdv([k("DOMACI", "ROBA"), eu], true)).toHaveLength(2);
    expect(napomenePdv([k("DOMACI", "ROBA")], false)).toEqual([]);
  });
});
