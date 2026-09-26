import { describe, expect, it } from "vitest";
import { hub3Tekst } from "@/domain/hub3";
import { pdfDokumenta, type PodaciPdf } from "./pdf-dokumenta";

const stranice = (b: Buffer) => (b.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
const stavke = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    rb: String(i + 1),
    naziv: `Lenovo ThinkPad T14 Gen 4 — stavka ${i + 1}`,
    opis: i % 2 ? `S/N: PF3ABC${i}, PF3ABD${i}` : null,
    kolicina: "2 kom",
    cijena: "1.000,00",
    popust: "",
    pdv: "25 %",
    iznos: "2.000,00",
  }));
const osnova: PodaciPdf = {
  naslov: "Račun",
  broj: "12/PP1/1",
  nacrt: false,
  firma: {
    naziv: "Demo d.o.o.",
    oib: "69435151530",
    adresa: "Savska cesta 41, 10000 Zagreb",
    iban: "HR1210010051863000160",
    banka: "Zagrebačka banka",
    kontakt: "info@demo.hr",
  },
  kupac: { naziv: "Kupac d.o.o.", adresa: "Ilica 1, 10000 Zagreb", oib: "33392005961", pdvBroj: null },
  poslovnica: null,
  podaci: [
    ["Datum", "25.09.2026."],
    ["Dospijeće", "10.10.2026."],
    ["Način plaćanja", "Transakcijski račun"],
  ],
  stavke: stavke(14),
  zbrojevi: [
    ["Osnovica", "28.000,00 €"],
    ["PDV 25 %", "7.000,00 €"],
  ],
  zaPlatiti: ["Ukupno za platiti", "35.000,00 €"],
  napomene: ["Obračun PDV-a prema naplaćenim naknadama."],
  napomena: "Hvala na povjerenju.",
  podnozje: "Demo d.o.o. · Trgovački sud u Zagrebu · MBS 080000000",
  hub3: hub3Tekst({
    iznos: 3500000,
    platitelj: { naziv: "Kupac d.o.o.", adresa: "Ilica 1", mjesto: "10000 Zagreb" },
    primatelj: { naziv: "Demo d.o.o.", adresa: "Savska cesta 41", mjesto: "10000 Zagreb" },
    iban: "HR1210010051863000160",
    model: "HR00",
    pozivNaBroj: "12-2026",
    sifraNamjene: "OTHR",
    opis: "Račun 12/PP1/1",
  }),
  qr: null,
};

describe("PDF dokumenta", () => {
  it("14 stavki s HUB3 i napomenama = 1 stranica", async () => {
    expect(stranice(await pdfDokumenta(osnova))).toBe(1);
  });
  it("60 stavki = više stranica, zbrojevi ne odvojeni od zadnje", async () => {
    const n = stranice(await pdfDokumenta({ ...osnova, stavke: stavke(60) }));
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(4);
  });
  it("snimka za pregled", async () => {
    const { writeFileSync } = await import("node:fs");
    if (process.env["SNIMI_PDF"]) writeFileSync(process.env["SNIMI_PDF"], await pdfDokumenta(osnova));
  });
  it("nacrt bez broja i bez kupca", async () => {
    expect(stranice(await pdfDokumenta({ ...osnova, broj: null, nacrt: true, kupac: null, hub3: null }))).toBe(1);
  });
});
