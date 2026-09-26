import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";
import { FONT, FONT_BOLD } from "./izvoz/pdf-tablica";

export type StavkaPdf = {
  rb: string;
  naziv: string;
  opis: string | null;
  kolicina: string;
  cijena: string;
  popust: string;
  pdv: string;
  iznos: string;
};

export type PodaciPdf = {
  naslov: string;
  broj: string | null;
  nacrt: boolean;
  firma: { naziv: string; oib: string; adresa: string; iban: string | null; banka: string | null; kontakt: string };
  kupac: { naziv: string; adresa: string; oib: string | null; pdvBroj: string | null } | null;
  poslovnica: string | null;
  podaci: [string, string][];
  stavke: StavkaPdf[];
  zbrojevi: [string, string][];
  zaPlatiti: [string, string] | null;
  napomene: string[];
  napomena: string | null;
  podnozje: string | null;
  /** HUB3 tekst za PDF417 (plaćanje) */
  hub3: string | null;
  /** tekst QR koda (provjera fiskaliziranog računa) */
  qr: string | null;
};

const MM = 72 / 25.4;
const SIVA = "#555";

/** PDF prodajnog dokumenta: A4, do ~14 stavki na jednoj stranici, zaglavlje tablice se ponavlja, „Stranica x / y“. */
export async function pdfDokumenta(d: PodaciPdf): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    bufferPages: true,
    info: { Title: `${d.naslov} ${d.broj ?? ""}`, Creator: "ERP-WMS" },
  });
  doc.registerFont("o", FONT);
  doc.registerFont("b", FONT_BOLD);
  const dijelovi: Buffer[] = [];
  doc.on("data", (x: Buffer) => dijelovi.push(x));
  const gotovo = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(dijelovi))));

  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const DNO = doc.page.height - doc.page.margins.bottom - 24; // prostor za podnožje

  // zaglavlje: firma lijevo, naslov desno
  doc
    .font("b")
    .fontSize(12)
    .text(d.firma.naziv, L, 40, { width: W * 0.55 });
  doc.font("o").fontSize(8).fillColor(SIVA);
  doc.text(
    [d.firma.adresa, `OIB: ${d.firma.oib}`, d.firma.iban ? `IBAN: ${d.firma.iban}${d.firma.banka ? ` (${d.firma.banka})` : ""}` : "", d.firma.kontakt]
      .filter(Boolean)
      .join("\n"),
    L,
    doc.y + 2,
    { width: W * 0.55 },
  );
  const krajFirme = doc.y;
  doc
    .fillColor("#000")
    .font("b")
    .fontSize(15)
    .text(d.naslov, L + W * 0.55, 40, { width: W * 0.45, align: "right" });
  doc
    .font("b")
    .fontSize(11)
    .text(d.broj ?? "NACRT", { width: W * 0.45, align: "right" });
  let y = Math.max(krajFirme, doc.y) + 14;

  // kupac i podaci dokumenta
  if (d.kupac) {
    doc.font("o").fontSize(7).fillColor(SIVA).text("KUPAC", L, y);
    doc
      .fillColor("#000")
      .font("b")
      .fontSize(10)
      .text(d.kupac.naziv, L, doc.y + 1, { width: W * 0.5 });
    doc
      .font("o")
      .fontSize(8.5)
      .text(
        [
          d.kupac.adresa,
          d.kupac.oib ? `OIB: ${d.kupac.oib}` : "",
          d.kupac.pdvBroj && !d.kupac.pdvBroj.startsWith("HR") ? `PDV ID: ${d.kupac.pdvBroj}` : "",
          d.poslovnica ? `Poslovnica: ${d.poslovnica}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        { width: W * 0.5 },
      );
  }
  const krajKupca = doc.y;
  doc.font("o").fontSize(8.5);
  let yp = y;
  for (const [n, v] of d.podaci) {
    doc.fillColor(SIVA).text(n, L + W * 0.55, yp, { width: W * 0.2 });
    doc.fillColor("#000").text(v, L + W * 0.75, yp, { width: W * 0.25, align: "right" });
    yp = doc.y + 1;
  }
  y = Math.max(krajKupca, yp) + 14;

  // tablica stavki
  const stupci = [
    { k: "rb", n: "#", w: 0.05, d: false },
    { k: "naziv", n: "Naziv", w: 0.39, d: false },
    { k: "kolicina", n: "Kol.", w: 0.1, d: true },
    { k: "cijena", n: "Cijena", w: 0.13, d: true },
    { k: "popust", n: "Popust", w: 0.08, d: true },
    { k: "pdv", n: "PDV", w: 0.08, d: true },
    { k: "iznos", n: "Iznos", w: 0.17, d: true },
  ] as const;
  const zaglavlje = () => {
    doc.font("b").fontSize(8).fillColor("#000");
    let x = L;
    for (const s of stupci) {
      doc.text(s.n, x + 2, y, { width: s.w * W - 4, align: s.d ? "right" : "left" });
      x += s.w * W;
    }
    y += 12;
    doc
      .moveTo(L, y)
      .lineTo(L + W, y)
      .lineWidth(0.8)
      .strokeColor("#000")
      .stroke();
    y += 3;
  };
  zaglavlje();
  for (const st of d.stavke) {
    doc.font("o").fontSize(8.5);
    const opisH = st.opis ? doc.fontSize(7).heightOfString(st.opis, { width: stupci[1].w * W - 4 }) : 0;
    const visina = doc.fontSize(8.5).heightOfString(st.naziv, { width: stupci[1].w * W - 4 }) + opisH + 5;
    if (y + visina > DNO) {
      doc.addPage();
      y = doc.page.margins.top;
      zaglavlje();
    }
    let x = L;
    for (const s of stupci) {
      doc
        .font("o")
        .fontSize(8.5)
        .fillColor("#000")
        .text(st[s.k], x + 2, y, { width: s.w * W - 4, align: s.d ? "right" : "left" });
      if (s.k === "naziv" && st.opis)
        doc
          .fontSize(7)
          .fillColor(SIVA)
          .text(st.opis, x + 2, doc.y, { width: s.w * W - 4 });
      x += s.w * W;
    }
    y += visina;
    doc
      .moveTo(L, y - 2)
      .lineTo(L + W, y - 2)
      .lineWidth(0.3)
      .strokeColor("#bbb")
      .stroke();
  }

  // zbrojevi (zajedno na istoj stranici)
  const redovi = d.zbrojevi.length + (d.zaPlatiti ? 1 : 0);
  if (y + redovi * 13 + 10 > DNO) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y += 6;
  for (const [n, v] of d.zbrojevi) {
    doc
      .font("o")
      .fontSize(9)
      .fillColor("#000")
      .text(n, L + W * 0.5, y, { width: W * 0.3, align: "right" });
    doc.text(v, L + W * 0.8, y, { width: W * 0.2, align: "right" });
    y += 13;
  }
  if (d.zaPlatiti) {
    doc
      .moveTo(L + W * 0.5, y)
      .lineTo(L + W, y)
      .lineWidth(0.8)
      .strokeColor("#000")
      .stroke();
    y += 3;
    doc
      .font("b")
      .fontSize(10.5)
      .text(d.zaPlatiti[0], L + W * 0.45, y, { width: W * 0.35, align: "right" });
    doc.text(d.zaPlatiti[1], L + W * 0.8, y, { width: W * 0.2, align: "right" });
    y += 16;
  }

  // napomene
  const tekstovi = [...d.napomene, ...(d.napomena ? [d.napomena] : [])];
  if (tekstovi.length) {
    doc.font("o").fontSize(8).fillColor("#000");
    const h = tekstovi.reduce((a, t) => a + doc.heightOfString(t, { width: W }) + 2, 0);
    if (y + h > DNO) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    for (const t of tekstovi) {
      doc.text(t, L, y, { width: W });
      y = doc.y + 2;
    }
  }

  // HUB3 (PDF417, ~58 × 26 mm) i QR
  const kodovi: { slika: Buffer; w: number; h: number; opis: string }[] = [];
  if (d.hub3) {
    const png = await bwipjs.toBuffer({ bcid: "pdf417", text: d.hub3, columns: 9, eclevel: 4, scale: 2, rowmult: 3 } as never);
    kodovi.push({ slika: png, w: 58 * MM, h: 26 * MM, opis: "Plaćanje skeniranjem (HUB3)" });
  }
  if (d.qr) {
    const png = await bwipjs.toBuffer({ bcid: "qrcode", text: d.qr, scale: 3 });
    kodovi.push({ slika: png, w: 22 * MM, h: 22 * MM, opis: "Provjera računa" });
  }
  if (kodovi.length) {
    const h = Math.max(...kodovi.map((k) => k.h)) + 14;
    if (y + h + 6 > DNO) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y += 6;
    let x = L;
    for (const k of kodovi) {
      // stvarna veličina uz zadržan omjer (natpis odmah ispod koda)
      // širina i visina iz zaglavlja PNG-a (IHDR)
      const sirina = k.slika.readUInt32BE(16);
      const visina = k.slika.readUInt32BE(20);
      const omjer = Math.min(k.w / sirina, k.h / visina);
      doc.image(k.slika, x, y, { width: sirina * omjer, height: visina * omjer });
      doc
        .font("o")
        .fontSize(7)
        .fillColor(SIVA)
        .text(k.opis, x, y + visina * omjer + 2, { width: k.w });
      x += k.w + 16;
    }
  }

  // podnožje i broj stranica; nacrt dobiva vodeni žig
  const raspon = doc.bufferedPageRange();
  for (let i = 0; i < raspon.count; i++) {
    doc.switchToPage(raspon.start + i);
    const stariDno = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    if (d.nacrt) {
      doc.save().rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc
        .font("b")
        .fontSize(90)
        .fillColor("#e5e5e5")
        .text("NACRT", 0, doc.page.height / 2 - 50, { width: doc.page.width, align: "center", lineBreak: false });
      doc.restore();
    }
    doc.font("o").fontSize(7).fillColor(SIVA);
    if (d.podnozje) doc.text(d.podnozje, L, doc.page.height - 34, { width: W - 70, lineBreak: false, ellipsis: true });
    doc.text(`Stranica ${i + 1} / ${raspon.count}`, L + W - 70, doc.page.height - 34, { width: 70, align: "right", lineBreak: false });
    doc.page.margins.bottom = stariDno;
  }
  doc.end();
  return gotovo;
}
