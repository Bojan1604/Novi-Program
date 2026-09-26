/**
 * Naljepnice — čista geometrija (milimetri): raspored naljepnica na papiru i elemenata na naljepnici.
 * Pravilo „ispis bez odrezivanja“: sav sadržaj mora biti unutar područja koje printer može otisnuti.
 */

export type Pravokutnik = { x: number; y: number; w: number; h: number };

export type Format = {
  naziv: string;
  papir: { w: number; h: number };
  stupci: number;
  redovi: number;
  /** naljepnica */
  w: number;
  h: number;
  /** položaj prve naljepnice i razmak između njih */
  lijevo: number;
  gore: number;
  razmakX: number;
  razmakY: number;
  /** unutarnji rub naljepnice (sadržaj ne ide do ruba) */
  unutra: number;
  /** rub papira koji printer ne može otisnuti */
  marginaPrintera: number;
};

export const FORMATI = {
  "a4-3x8": {
    naziv: "A4 arak · 3×8 (70×37 mm)",
    papir: { w: 210, h: 297 },
    stupci: 3,
    redovi: 8,
    w: 70,
    h: 37,
    lijevo: 0,
    gore: 0.5,
    razmakX: 0,
    razmakY: 0,
    unutra: 4.5,
    marginaPrintera: 4,
  },
  "a4-3x7": {
    naziv: "A4 arak · 3×7 (70×42,3 mm)",
    papir: { w: 210, h: 297 },
    stupci: 3,
    redovi: 7,
    w: 70,
    h: 42.3,
    lijevo: 0,
    gore: 0.45,
    razmakX: 0,
    razmakY: 0,
    unutra: 4.5,
    marginaPrintera: 4,
  },
  "a4-2x7": {
    naziv: "A4 arak · 2×7 (99,1×38,1 mm)",
    papir: { w: 210, h: 297 },
    stupci: 2,
    redovi: 7,
    w: 99.1,
    h: 38.1,
    lijevo: 4.65,
    gore: 15.15,
    razmakX: 2.5,
    razmakY: 0,
    unutra: 3,
    marginaPrintera: 4,
  },
  "traka-50x25": {
    naziv: "Printer naljepnica · 50×25 mm",
    papir: { w: 50, h: 25 },
    stupci: 1,
    redovi: 1,
    w: 50,
    h: 25,
    lijevo: 0,
    gore: 0,
    razmakX: 0,
    razmakY: 0,
    unutra: 1.5,
    marginaPrintera: 1,
  },
  "traka-62x29": {
    naziv: "Printer naljepnica · 62×29 mm (Brother)",
    papir: { w: 62, h: 29 },
    stupci: 1,
    redovi: 1,
    w: 62,
    h: 29,
    lijevo: 0,
    gore: 0,
    razmakX: 0,
    razmakY: 0,
    unutra: 1.5,
    marginaPrintera: 1,
  },
  "traka-100x50": {
    naziv: "Printer naljepnica · 100×50 mm",
    papir: { w: 100, h: 50 },
    stupci: 1,
    redovi: 1,
    w: 100,
    h: 50,
    lijevo: 0,
    gore: 0,
    razmakX: 0,
    razmakY: 0,
    unutra: 2.5,
    marginaPrintera: 1,
  },
} as const satisfies Record<string, Format>;

export type KljucFormata = keyof typeof FORMATI;
export const POPIS_FORMATA = Object.keys(FORMATI) as KljucFormata[];

export function jeFormat(v: unknown): v is KljucFormata {
  return typeof v === "string" && Object.hasOwn(FORMATI, v);
}

export const NAJVISE_NALJEPNICA = 1000;

/** Naljepnica na arku: stranica i pravokutnik. `pocetak` (1…) preskače već iskorištene naljepnice na prvom arku. */
export function raspored(format: Format, broj: number, pocetak = 1): { stranica: number; okvir: Pravokutnik }[] {
  const poStranici = format.stupci * format.redovi;
  const preskoci = Math.min(Math.max(Math.floor(pocetak) - 1, 0), poStranici - 1);
  const r: { stranica: number; okvir: Pravokutnik }[] = [];
  for (let i = 0; i < broj; i++) {
    const mjesto = i + preskoci;
    const naStranici = mjesto % poStranici;
    const stupac = naStranici % format.stupci;
    const redak = Math.floor(naStranici / format.stupci);
    r.push({
      stranica: Math.floor(mjesto / poStranici),
      okvir: {
        x: format.lijevo + stupac * (format.w + format.razmakX),
        y: format.gore + redak * (format.h + format.razmakY),
        w: format.w,
        h: format.h,
      },
    });
  }
  return r;
}

/** Code 128 (B): 11 modula po znaku + početni, kontrolni i završni znak (13 modula) + tihe zone 2×10. */
export function moduliCode128(tekst: string): number {
  return 11 * (tekst.length + 2) + 13 + 20;
}

/** Najuži modul koji printeri pouzdano otisnu i čitači pročitaju (203 dpi ≈ 0,125 mm po točki → 2 točke). */
export const NAJUZI_MODUL = 0.25;
/** QR ispod 12 mm mobitel teško čita. */
export const NAJMANJI_QR = 12;

export type Izgled = {
  qr: (Pravokutnik & { w: number }) | null;
  barkod: Pravokutnik | null;
  /** redci teksta: naziv (model), serijski */
  naziv: Pravokutnik;
  serijski: Pravokutnik;
  /** veličina slova u mm (visina retka) */
  slovaNaziv: number;
  slovaSerijski: number;
};

/**
 * Raspored elemenata na naljepnici (koordinate unutar naljepnice).
 * QR lijevo (kvadrat), desno naziv, serijski i barkod. Ako barkod ne stane uz QR, QR se izostavlja;
 * ako ne stane ni tada, ostaje samo QR (on uvijek stane).
 */
export function izgled(format: Format, serijski: string): Izgled {
  const p = format.unutra;
  const unW = format.w - 2 * p;
  const unH = format.h - 2 * p;
  const slovaNaziv = Math.min(3, unH * 0.16);
  const slovaSerijski = Math.min(3.6, unH * 0.2);
  const razmak = 1.5;
  const potrebno = moduliCode128(serijski) * NAJUZI_MODUL;

  // QR se smanjuje (do 12 mm) da barkod stane pokraj njega
  const najveciQr = Math.min(unH, unW * 0.4);
  const qrUzBarkod = Math.min(najveciQr, unW - razmak - potrebno);
  const qrStr = qrUzBarkod >= NAJMANJI_QR ? qrUzBarkod : najveciQr;
  const desnoX = p + qrStr + razmak;
  const desnoW = format.w - p - desnoX;
  const tekstH = slovaNaziv + slovaSerijski + 1;
  const barkodH = unH - tekstH;

  const sTekstom = (x: number, w: number, barkod: Pravokutnik | null, qr: Izgled["qr"]): Izgled => ({
    qr,
    barkod,
    naziv: { x, y: p, w, h: slovaNaziv },
    serijski: { x, y: p + slovaNaziv + 0.5, w, h: slovaSerijski },
    slovaNaziv,
    slovaSerijski,
  });

  if (desnoW >= potrebno && barkodH >= 5) {
    return sTekstom(desnoX, desnoW, { x: desnoX, y: p + tekstH, w: desnoW, h: barkodH }, { x: p, y: p + (unH - qrStr) / 2, w: qrStr, h: qrStr });
  }
  if (unW >= potrebno && barkodH >= 5) return sTekstom(p, unW, { x: p, y: p + tekstH, w: unW, h: barkodH }, null);
  return sTekstom(desnoX, desnoW, null, { x: p, y: p + (unH - qrStr) / 2, w: qrStr, h: qrStr });
}

/** Svi pravokutnici sadržaja naljepnice na papiru (za provjeru odrezivanja). */
export function sadrzajNaPapiru(okvir: Pravokutnik, iz: Izgled): Pravokutnik[] {
  return [iz.qr, iz.barkod, iz.naziv, iz.serijski]
    .filter((x): x is Pravokutnik => x !== null)
    .map((r) => ({ x: okvir.x + r.x, y: okvir.y + r.y, w: r.w, h: r.h }));
}

/** Je li pravokutnik unutar područja koje printer otisne. */
export function unutarIspisa(format: Format, r: Pravokutnik): boolean {
  const m = format.marginaPrintera;
  const e = 1e-9;
  return r.x >= m - e && r.y >= m - e && r.x + r.w <= format.papir.w - m + e && r.y + r.h <= format.papir.h - m + e && r.w > 0 && r.h > 0;
}
