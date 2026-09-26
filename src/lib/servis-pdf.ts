import PDFDocument from "pdfkit";
import type { PrismaClient } from "@/generated/prisma/client";
import { STATUSI_SERVISA, type StatusServisa } from "@/domain/servis";
import { FONT, FONT_BOLD } from "./izvoz/pdf-tablica";

/**
 * Servisni nalog / otpremnica (PDF) — isti dokument u programu i na portalu.
 * Sadrži samo podatke koje smije vidjeti klijent: bez interne dijagnoze, internih događaja i cijena.
 */
export type PodaciNalogaPdf = {
  firma: { naziv: string; oib: string; adresa: string; kontakt: string };
  broj: string;
  datum: string;
  zatvoren: string | null;
  status: string;
  klijent: string | null;
  kontakt: string | null;
  uredaj: string;
  zamjenski: string | null;
  opisKvara: string;
  napomena: string | null;
  tijek: { vrijeme: string; opis: string }[];
};

const hr = (d: Date) => new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" }).format(d);
const hrVrijeme = (d: Date) => new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" }).format(d);

/** Podaci za PDF; `partnerId` (portal) ograničava na nalog tog klijenta. */
export async function podaciNalogaPdf(db: PrismaClient, firmaId: string, id: string, partnerId?: string): Promise<PodaciNalogaPdf | null> {
  const n = await db.servisniNalog.findFirst({
    where: { id, firmaId, ...(partnerId ? { partnerId } : {}) },
    select: {
      broj: true,
      datum: true,
      zatvoren: true,
      status: true,
      opisKvara: true,
      napomenaKlijentu: true,
      kontakt: true,
      partner: { select: { naziv: true } },
      uredaj: { select: { serijski: true, model: { select: { naziv: true, proizvodjac: { select: { naziv: true } } } } } },
      zamjenski: { select: { serijski: true } },
      zamjenaDo: true,
      dogadaji: { where: { javno: true }, orderBy: { vrijeme: "asc" }, select: { vrijeme: true, opis: true } },
      firma: { select: { naziv: true, oib: true, adresa: true, postanskiBroj: true, mjesto: true, telefon: true, email: true } },
    },
  });
  if (!n) return null;
  const f = n.firma;
  return {
    firma: {
      naziv: f.naziv,
      oib: f.oib,
      adresa: [f.adresa, [f.postanskiBroj, f.mjesto].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      kontakt: [f.telefon, f.email].filter(Boolean).join(" · "),
    },
    broj: n.broj,
    datum: hr(n.datum),
    zatvoren: n.zatvoren ? hr(n.zatvoren) : null,
    status: STATUSI_SERVISA[n.status as StatusServisa] ?? n.status,
    klijent: n.partner?.naziv ?? null,
    kontakt: n.kontakt,
    uredaj: `${n.uredaj.serijski} · ${n.uredaj.model.proizvodjac.naziv} ${n.uredaj.model.naziv}`,
    zamjenski: n.zamjenski ? `${n.zamjenski.serijski}${n.zamjenaDo ? ` (vraćen ${hr(n.zamjenaDo)})` : ""}` : null,
    opisKvara: n.opisKvara,
    napomena: n.napomenaKlijentu,
    tijek: n.dogadaji.map((d) => ({ vrijeme: hrVrijeme(d.vrijeme), opis: d.opis })),
  };
}

export async function pdfNaloga(d: PodaciNalogaPdf): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    info: { Title: `Servisni nalog ${d.broj}`, Creator: "ERP-WMS" },
  });
  doc.registerFont("o", FONT);
  doc.registerFont("b", FONT_BOLD);
  const dijelovi: Buffer[] = [];
  doc.on("data", (x: Buffer) => dijelovi.push(x));
  const gotovo = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(dijelovi))));
  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;

  doc
    .font("b")
    .fontSize(12)
    .text(d.firma.naziv, L, 40, { width: W / 2 });
  doc.font("o").fontSize(8.5).fillColor("#555");
  doc.text(`OIB ${d.firma.oib}`, { width: W / 2 });
  if (d.firma.adresa) doc.text(d.firma.adresa, { width: W / 2 });
  if (d.firma.kontakt) doc.text(d.firma.kontakt, { width: W / 2 });
  doc
    .fillColor("black")
    .font("b")
    .fontSize(15)
    .text("Servisni nalog / otpremnica", L + W / 2, 40, { width: W / 2, align: "right" });
  doc
    .font("o")
    .fontSize(11)
    .text(d.broj, L + W / 2, doc.y, { width: W / 2, align: "right" });
  doc.moveDown(3);

  const y0 = Math.max(doc.y, 120);
  doc.y = y0;
  const redak = (oznaka: string, vrijednost: string | null) => {
    if (!vrijednost) return;
    const y = doc.y;
    doc.font("b").fontSize(9.5).text(oznaka, L, y, { width: 120 });
    doc
      .font("o")
      .fontSize(9.5)
      .text(vrijednost, L + 125, y, { width: W - 125 });
    doc.moveDown(0.35);
  };
  redak("Zaprimljen", d.datum);
  redak("Završen", d.zatvoren);
  redak("Status", d.status);
  redak("Klijent", d.klijent);
  redak("Kontakt", d.kontakt);
  redak("Uređaj", d.uredaj);
  redak("Zamjenski uređaj", d.zamjenski);
  redak("Opis kvara", d.opisKvara);
  redak("Napomena", d.napomena);

  doc.moveDown(0.8);
  doc.font("b").fontSize(10.5).text("Tijek", L, doc.y);
  doc.moveDown(0.3);
  for (const t of d.tijek) {
    if (doc.y > doc.page.height - 140) doc.addPage();
    const y = doc.y;
    doc.font("o").fontSize(8.5).fillColor("#555").text(t.vrijeme, L, y, { width: 90 });
    const kraj = doc.y;
    doc
      .fillColor("black")
      .fontSize(9)
      .text(t.opis, L + 95, y, { width: W - 95 });
    doc.y = Math.max(doc.y, kraj);
    doc.moveDown(0.25);
  }

  // potpisi
  const yp = Math.max(doc.y + 40, doc.page.height - 120);
  if (yp > doc.page.height - 60) doc.addPage();
  const y = Math.min(yp, doc.page.height - 100);
  doc
    .moveTo(L, y)
    .lineTo(L + 200, y)
    .stroke("#999");
  doc
    .moveTo(L + W - 200, y)
    .lineTo(L + W, y)
    .stroke("#999");
  doc.font("o").fontSize(8.5).fillColor("#555");
  doc.text("Predao (servis)", L, y + 4, { width: 200 });
  doc.text("Preuzeo (klijent)", L + W - 200, y + 4, { width: 200 });
  doc.end();
  return gotovo;
}
