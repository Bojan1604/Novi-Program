import ExcelJS from "exceljs";
import type { StupacIzvoza } from "./stupci";

/** Datum/vrijeme u „zidno“ vrijeme Zagreba (Excel nema vremenske zone). */
function zidnoVrijeme(d: Date): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zagreb",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return new Date(Date.UTC(+p["year"]!, +p["month"]! - 1, +p["day"]!, +p["hour"]!, +p["minute"]!, +p["second"]!));
}

export async function uXlsx<R>(naslov: string, stupci: readonly StupacIzvoza<R>[], redovi: Iterable<R>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP-WMS";
  const ws = wb.addWorksheet(naslov.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = stupci.map((s) => ({
    header: s.naslov,
    width: s.sirina ?? (s.vrsta === "iznos" || s.vrsta === "broj" ? 14 : s.vrsta === "datum" ? 12 : s.vrsta === "vrijeme" ? 17 : 28),
    style:
      s.vrsta === "iznos"
        ? { numFmt: "#,##0.00" }
        : s.vrsta === "datum"
          ? { numFmt: "dd.mm.yyyy." }
          : s.vrsta === "vrijeme"
            ? { numFmt: "dd.mm.yyyy. hh:mm" }
            : {},
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of redovi) {
    ws.addRow(
      stupci.map((s) => {
        const v = s.vrijednost(r);
        if (v === null || v === undefined) return null;
        switch (s.vrsta) {
          case "iznos":
            return Number(v) / 100;
          case "broj":
            return Number(v);
          case "datum":
            return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${String(v)}T00:00:00Z`) : String(v);
          case "vrijeme":
            return v instanceof Date ? zidnoVrijeme(v) : String(v);
          default:
            return v instanceof Date ? zidnoVrijeme(v) : String(v);
        }
      }),
    );
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, stupci.length) } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
