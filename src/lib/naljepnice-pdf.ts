import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";
import { izgled, raspored, type Format } from "@/domain/naljepnice";
import { PUTANJA_NALJEPNICE } from "@/domain/skeniranje";
import { FONT, FONT_BOLD } from "./izvoz/pdf-tablica";

const MM = 72 / 25.4;

export type PodaciNaljepnice = { serijski: string; naziv: string };

/**
 * PDF naljepnica u stvarnoj veličini (ispis „100 %“, ne „prilagodi stranici“).
 * QR vodi na uređaj u programu (`adresa` + /uredaji/sn/<serijski>), barkod je Code 128 serijskog broja.
 */
export async function pdfNaljepnica(format: Format, naljepnice: readonly PodaciNaljepnice[], adresa: string, pocetak = 1): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [format.papir.w * MM, format.papir.h * MM],
    margin: 0,
    autoFirstPage: false,
    info: { Title: "Naljepnice", Creator: "ERP-WMS" },
  });
  doc.registerFont("obican", FONT);
  doc.registerFont("debeo", FONT_BOLD);
  const dijelovi: Buffer[] = [];
  doc.on("data", (d: Buffer) => dijelovi.push(d));
  const gotovo = new Promise<Buffer>((rijesi) => doc.on("end", () => rijesi(Buffer.concat(dijelovi))));

  const mjesta = raspored(format, naljepnice.length, pocetak);
  let stranica = -1;
  for (let i = 0; i < naljepnice.length; i++) {
    const n = naljepnice[i]!;
    const { stranica: s, okvir } = mjesta[i]!;
    while (stranica < s) {
      doc.addPage({ size: [format.papir.w * MM, format.papir.h * MM], margin: 0 });
      stranica++;
    }
    const iz = izgled(format, n.serijski);
    const x = (mm: number) => (okvir.x + mm) * MM;
    const y = (mm: number) => (okvir.y + mm) * MM;
    const tekst = (t: string, r: { x: number; y: number; w: number }, visina: number, font: string) => {
      doc
        .font(font)
        .fontSize((visina * MM) / 1.2)
        .text(t, x(r.x), y(r.y), { width: r.w * MM, height: visina * MM, lineBreak: false, ellipsis: true });
    };
    tekst(n.naziv, iz.naziv, iz.slovaNaziv, "obican");
    tekst(n.serijski, iz.serijski, iz.slovaSerijski, "debeo");
    if (iz.barkod) {
      const png = await bwipjs.toBuffer({ bcid: "code128", text: n.serijski, scale: 4, height: 10, paddingwidth: 10, includetext: false });
      doc.image(png, x(iz.barkod.x), y(iz.barkod.y), { width: iz.barkod.w * MM, height: iz.barkod.h * MM });
    }
    if (iz.qr) {
      const png = await bwipjs.toBuffer({ bcid: "qrcode", text: `${adresa}${PUTANJA_NALJEPNICE}${encodeURIComponent(n.serijski)}`, scale: 4 });
      doc.image(png, x(iz.qr.x), y(iz.qr.y), { width: iz.qr.w * MM, height: iz.qr.w * MM });
    }
  }
  if (stranica < 0) doc.addPage();
  doc.end();
  return gotovo;
}
