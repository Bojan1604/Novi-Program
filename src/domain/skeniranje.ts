/**
 * Skeniranje — čista logika: iz sadržaja barkoda/QR koda ili prepoznatog teksta (OCR) izvući serijski broj.
 */
import { provjeriSerijski } from "./stanja-uredaja";

/** Putanja u QR kodu naljepnice programa: https://…/uredaji/sn/<serijski> */
export const PUTANJA_NALJEPNICE = "/uredaji/sn/";

/**
 * Sadržaj barkoda → serijski broj (ili null ako nije serijski).
 * Razumije: naš QR (poveznica na uređaj), „S/N: …“, GS1 s AI (21) serijski broj, i goli serijski.
 */
export function serijskiIzKoda(sadrzaj: string): string | null {
  // GS (\u001d) odvaja polja u GS1 kodovima; ostali kontrolni znakovi se brišu
  let t = sadrzaj.replace(/[\u0000-\u001c\u001e\u001f\u007f]/g, "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    const url = tryUrl(t);
    const i = url ? url.pathname.indexOf(PUTANJA_NALJEPNICE) : -1;
    if (!url || i < 0) return null;
    t = decodeURIComponent(url.pathname.slice(i + PUTANJA_NALJEPNICE.length).split("/")[0] ?? "");
  } else {
    const gs1 = /\(21\)([^()\u001d]+)/.exec(t) ?? /^(?:\][A-Za-z]\d)?01\d{14}21([^\u001d]+)/.exec(t);
    t = gs1 ? gs1[1]! : t.replace(/^(?:s\/n|sn|serial(?:\s*no\.?)?|ser\.?\s*no\.?|serijski(?:\s*broj)?)\s*[:#.]?\s*/i, "");
  }
  // barkod serijskog nema razmaka — tekst s razmacima nije serijski broj
  if (/\s/.test(t.trim())) return null;
  const r = provjeriSerijski(t);
  return r.ok ? r.vrijednost : null;
}

function tryUrl(t: string): URL | null {
  try {
    return new URL(t);
  } catch {
    return null;
  }
}

const OZNAKA = /\b(?:s\/?n|serial(?:\s*(?:no|number|#))?|ser\.?\s*no|serijski(?:\s*broj)?)\b\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_./]{3,40})/gi;
const RIJECI = new Set(["MODEL", "SERIAL", "NUMBER", "MADE", "CHINA", "INPUT", "OUTPUT", "POWER", "BATTERY", "PRODUCT", "VERSION"]);

/**
 * Prepoznati tekst s naljepnice → mogući serijski brojevi, najvjerojatniji prvi:
 * najprije oni uz oznaku (S/N, Serial No…), zatim riječi sa slovima i brojkama (6–30 znakova).
 */
export function kandidatiIzTeksta(tekst: string): string[] {
  const r: string[] = [];
  const dodaj = (s: string) => {
    const p = provjeriSerijski(s.replace(/[.\-_/]+$/, ""));
    if (p.ok && !r.includes(p.vrijednost)) r.push(p.vrijednost);
  };
  for (const m of tekst.matchAll(OZNAKA)) dodaj(m[1]!);
  for (const rijec of tekst.toUpperCase().split(/[^A-Z0-9\-_./]+/)) {
    const s = rijec.replace(/^[.\-_/]+|[.\-_/]+$/g, "");
    if (s.length < 6 || s.length > 30 || RIJECI.has(s)) continue;
    if (/[A-Z]/.test(s) && /\d/.test(s)) dodaj(s);
  }
  return r.slice(0, 8);
}

export type SkeniranaStavka = { serijski: string; puta: number };

/** Skupni način: novi kod na vrh popisa; ponovljeni se ne dodaje, nego broji. */
export function dodajUSkupno(popis: readonly SkeniranaStavka[], serijski: string): { popis: SkeniranaStavka[]; nov: boolean } {
  const i = popis.findIndex((s) => s.serijski === serijski);
  if (i >= 0) return { popis: popis.map((s, j) => (j === i ? { ...s, puta: s.puta + 1 } : s)), nov: false };
  return { popis: [{ serijski, puta: 1 }, ...popis], nov: true };
}
