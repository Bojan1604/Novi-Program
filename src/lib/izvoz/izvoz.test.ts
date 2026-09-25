import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { uPdfTablicu } from "./pdf-tablica";
import type { StupacIzvoza } from "./stupci";
import { uXlsx } from "./xlsx";

type R = { naziv: string; iznos: number; datum: string; vrijeme: Date };
const stupci: StupacIzvoza<R>[] = [
  { naslov: "Naziv", vrijednost: (r) => r.naziv },
  { naslov: "Iznos", vrsta: "iznos", vrijednost: (r) => r.iznos },
  { naslov: "Datum", vrsta: "datum", vrijednost: (r) => r.datum },
  { naslov: "Vrijeme", vrsta: "vrijeme", vrijednost: (r) => r.vrijeme },
];
const redovi: R[] = Array.from({ length: 120 }, (_, i) => ({
  naziv: `Čćžšđ uređaj ${i}`,
  iznos: 150050 + i,
  datum: "2026-09-25",
  vrijeme: new Date("2026-07-01T22:30:00Z"),
}));

describe("Excel", () => {
  it("brojevi kao brojevi, datumi kao datumi, vrijeme po Zagrebu", async () => {
    const buf = await uXlsx("Uređaji", stupci, redovi);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe("Naziv");
    expect(ws.getRow(2).getCell(1).value).toBe("Čćžšđ uređaj 0");
    expect(ws.getRow(2).getCell(2).value).toBe(1500.5);
    expect((ws.getRow(2).getCell(3).value as Date).toISOString()).toBe("2026-09-25T00:00:00.000Z");
    // 22:30 UTC u srpnju = 00:30 sljedećeg dana u Zagrebu
    expect((ws.getRow(2).getCell(4).value as Date).toISOString()).toBe("2026-07-02T00:30:00.000Z");
    expect(ws.rowCount).toBe(121);
  });
});

describe("PDF", () => {
  it("više stranica s brojem stranica, hrvatska slova", async () => {
    const buf = await uPdfTablicu("Uređaji", "Izvezeno 25.09.2026.", stupci, redovi);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const stranice = (buf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    // 120 redaka po ~33 na stranici = 4 stranice (ne više — podnožje ne smije dodavati stranice)
    expect(stranice).toBe(4);
    expect(buf.toString("latin1")).toContain("DejaVuSans");
  });

  it("prazan popis", async () => {
    const buf = await uPdfTablicu("Prazno", "", stupci, []);
    expect((buf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
  });
});
