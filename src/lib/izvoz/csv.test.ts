import { describe, expect, it } from "vitest";
import { uCsv } from "./csv";
import { dopusteniStupci, type StupacIzvoza } from "./stupci";

type R = { naziv: string; iznos: number; nabavna: number; datum: string };
const stupci: StupacIzvoza<R>[] = [
  { naslov: "Naziv", vrijednost: (r) => r.naziv },
  { naslov: "Iznos", vrsta: "iznos", vrijednost: (r) => r.iznos },
  { naslov: "Nabavna", vrsta: "iznos", osjetljivo: true, vrijednost: (r) => r.nabavna },
  { naslov: "Datum", vrsta: "datum", vrijednost: (r) => r.datum },
];
const redovi: R[] = [
  { naziv: 'Laptop "Pro"; 15"', iznos: 150050, nabavna: 99900, datum: "2026-09-25" },
  { naziv: '=HYPERLINK("http://zlo")', iznos: -100, nabavna: 0, datum: "2026-01-01" },
];

describe("CSV", () => {
  it("BOM, točka-zarez, hrvatski brojevi i datumi, navodnici", () => {
    const csv = uCsv(stupci, redovi);
    expect(csv.startsWith("﻿Naziv;Iznos;Nabavna;Datum\r\n")).toBe(true);
    expect(csv).toContain('"Laptop ""Pro""; 15"""');
    expect(csv).toContain(";1.500,50;999,00;25.09.2026.");
    expect(csv).toContain(";-1,00;");
  });

  it("formula iz korisničkog teksta ne izvršava se u Excelu", () => {
    expect(uCsv(stupci, redovi)).toContain(`"'=HYPERLINK(""http://zlo"")"`);
  });

  it("bez prava na nabavne cijene stupac ne postoji u izvozu", () => {
    const csv = uCsv(dopusteniStupci(stupci, false), redovi);
    expect(csv).not.toContain("Nabavna");
    expect(csv).not.toContain("999,00");
  });
});
