import { join } from "node:path";
import PDFDocument from "pdfkit";
import { tekstVrijednosti, type StupacIzvoza } from "./stupci";

export const FONT = join(process.cwd(), "assets/fonts/DejaVuSans.ttf");
export const FONT_BOLD = join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");

/** PDF popisa: A4 položeno, naslov, tablica s ponovljenim zaglavljem, „Stranica x / y“. */
export async function uPdfTablicu<R>(naslov: string, podnaslov: string, stupci: readonly StupacIzvoza<R>[], redovi: readonly R[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true, info: { Title: naslov, Creator: "ERP-WMS" } });
  doc.registerFont("obican", FONT);
  doc.registerFont("debeo", FONT_BOLD);
  const dijelovi: Buffer[] = [];
  doc.on("data", (d: Buffer) => dijelovi.push(d));
  const gotovo = new Promise<Buffer>((rijesi) => doc.on("end", () => rijesi(Buffer.concat(dijelovi))));

  const lijevo = doc.page.margins.left;
  const sirina = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const tezine = stupci.map(
    (s) => s.sirina ?? (s.vrsta === "iznos" || s.vrsta === "broj" || s.vrsta === "datum" ? 10 : s.vrsta === "vrijeme" ? 13 : 22),
  );
  const ukupnaTezina = tezine.reduce((a, b) => a + b, 0);
  const sirine = tezine.map((t) => (t / ukupnaTezina) * sirina);
  const desno = (s: StupacIzvoza<R>) => s.vrsta === "iznos" || s.vrsta === "broj";
  const VELICINA = 8;

  doc.font("debeo").fontSize(14).text(naslov, lijevo, doc.y);
  doc.font("obican").fontSize(9).fillColor("#555").text(podnaslov).fillColor("#000").moveDown(0.5);

  const red = (vrijednosti: string[], debeo: boolean) => {
    doc.font(debeo ? "debeo" : "obican").fontSize(VELICINA);
    const visina = Math.max(...vrijednosti.map((v, i) => doc.heightOfString(v, { width: sirine[i]! - 4 }))) + 4;
    if (doc.y + visina > doc.page.height - doc.page.margins.bottom - 14) {
      doc.addPage();
      if (!debeo) zaglavlje();
    }
    const y = doc.y;
    let x = lijevo;
    vrijednosti.forEach((v, i) => {
      doc.text(v, x + 2, y + 2, { width: sirine[i]! - 4, align: desno(stupci[i]!) ? "right" : "left" });
      x += sirine[i]!;
    });
    doc.y = y + visina;
    doc
      .moveTo(lijevo, doc.y)
      .lineTo(lijevo + sirina, doc.y)
      .lineWidth(debeo ? 0.8 : 0.3)
      .strokeColor(debeo ? "#000" : "#bbb")
      .stroke();
    doc.x = lijevo;
  };
  const zaglavlje = () =>
    red(
      stupci.map((s) => s.naslov),
      true,
    );

  zaglavlje();
  for (const r of redovi)
    red(
      stupci.map((s) => tekstVrijednosti(s.vrijednost(r), s.vrsta)),
      false,
    );
  if (redovi.length === 0)
    doc
      .font("obican")
      .fontSize(9)
      .text("Nema podataka.", lijevo, doc.y + 6);

  const raspon = doc.bufferedPageRange();
  for (let i = 0; i < raspon.count; i++) {
    doc.switchToPage(raspon.start + i);
    // podnožje je ispod donje margine — bez margine pdfkit ne dodaje novu stranicu
    const margina = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("obican").fontSize(7).fillColor("#555");
    doc.text(`Stranica ${i + 1} / ${raspon.count}`, lijevo, doc.page.height - margina + 8, { width: sirina, align: "right", lineBreak: false });
    doc.page.margins.bottom = margina;
  }
  doc.end();
  return gotovo;
}
