import { describe, expect, it } from "vitest";
import { procitajPolja, type Polje } from "./polja";

const POLJA: Polje[] = [
  { ime: "naziv", oznaka: "Naziv", vrsta: "tekst", obavezno: true, najvise: 20 },
  { ime: "cijena", oznaka: "Cijena", vrsta: "iznos", max: 10_000_000 },
  { ime: "marza", oznaka: "Marža", vrsta: "postotak" },
  { ime: "jamstvo", oznaka: "Jamstvo", vrsta: "cijeli", min: 0, max: 120 },
  { ime: "kpd", oznaka: "KPD", vrsta: "kpd" },
  { ime: "aktivan", oznaka: "Aktivan", vrsta: "kvacica" },
  { ime: "vrsta", oznaka: "Vrsta", vrsta: "odabir", opcije: [{ vrijednost: "a", naziv: "A" }] },
  { ime: "datum", oznaka: "Datum", vrsta: "datum" },
];

const iz = (o: Record<string, string>) => (ime: string) => o[ime] ?? null;

describe("procitajPolja", () => {
  it("ispravan unos", () => {
    expect(
      procitajPolja(
        POLJA,
        iz({
          naziv: "  Laptop   Pro ",
          cijena: "1.500,50",
          marza: "25,5 %",
          jamstvo: "24",
          kpd: "262011",
          aktivan: "on",
          vrsta: "a",
          datum: "1.2.2026",
        }),
      ),
    ).toEqual({
      ok: true,
      vrijednosti: { naziv: "Laptop Pro", cijena: 150050, marza: 2550, jamstvo: 24, kpd: "26.20.11", aktivan: true, vrsta: "a", datum: "2026-02-01" },
    });
  });

  it("prazna neobavezna polja su null, kvačica false", () => {
    const r = procitajPolja(POLJA, iz({ naziv: "X" }));
    expect(r).toEqual({
      ok: true,
      vrijednosti: { naziv: "X", cijena: null, marza: null, jamstvo: null, kpd: null, aktivan: false, vrsta: null, datum: null },
    });
  });

  it("svaka greška uz svoje polje; tekst u iznosu nikad nije 0", () => {
    const r = procitajPolja(POLJA, iz({ naziv: "", cijena: "abc", marza: "-5", jamstvo: "200", kpd: "12", vrsta: "b", datum: "31.2.2026" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.polja).sort()).toEqual(["cijena", "datum", "jamstvo", "kpd", "marza", "naziv", "vrsta"]);
    expect(r.polja["naziv"]).toContain("naziv");
    expect(r.polja["jamstvo"]).toContain("120");
  });

  it("preduga vrijednost i prevelik iznos", () => {
    const r = procitajPolja(POLJA, iz({ naziv: "x".repeat(21), cijena: "200.000,00" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.polja["naziv"]).toContain("20");
      expect(r.polja["cijena"]).toContain("Najviše");
    }
  });
});
