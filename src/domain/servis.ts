import type { Stanje } from "./stanja-uredaja";

/**
 * Servisni nalog (korak 5.1) — čista pravila: statusi, završetak i zamjenski uređaj.
 * Stanje uređaja mijenja samo servis kroz radnje iz `stanja-uredaja.ts`; ovdje se odlučuje KOJE.
 */
export const STATUSI_SERVISA = {
  /** prijava kvara s portala: uređaj je još kod klijenta (stanje se mijenja tek pri zaprimanju) */
  PRIJAVLJEN: "Prijavljen",
  ZAPRIMLJEN: "Zaprimljen",
  DIJAGNOZA: "Dijagnoza",
  CEKA_DIJELOVE: "Čeka dijelove",
  POPRAVAK: "U popravku",
  GOTOV: "Gotov — čeka preuzimanje",
  VRACEN: "Vraćen",
  OTPISAN: "Otpisan",
  OTKAZAN: "Otkazan",
} as const;
export type StatusServisa = keyof typeof STATUSI_SERVISA;
export const OTVORENI_STATUSI = [
  "PRIJAVLJEN",
  "ZAPRIMLJEN",
  "DIJAGNOZA",
  "CEKA_DIJELOVE",
  "POPRAVAK",
  "GOTOV",
] as const satisfies readonly StatusServisa[];
/** statusi koje serviser bira ručno (prijavljen → zaprimljen samo zaprimanjem uređaja) */
export const RADNI_STATUSI = ["ZAPRIMLJEN", "DIJAGNOZA", "CEKA_DIJELOVE", "POPRAVAK", "GOTOV"] as const satisfies readonly StatusServisa[];
export type OtvoreniStatus = (typeof OTVORENI_STATUSI)[number];
export type Zavrsetak = "VRACEN" | "OTPISAN" | "OTKAZAN";

export function jeOtvoren(s: string): s is OtvoreniStatus {
  return (OTVORENI_STATUSI as readonly string[]).includes(s);
}

/** Ručna promjena statusa: samo među otvorenima (završetak ima svoje radnje). */
export function provjeriStatus(trenutni: string, novi: string): string | null {
  if (!jeOtvoren(trenutni)) return "Nalog je zatvoren.";
  if (trenutni === "PRIJAVLJEN") return "Prijavljen kvar — prvo zaprimite uređaj.";
  if (!(RADNI_STATUSI as readonly string[]).includes(novi)) return "Nepoznat status.";
  if (trenutni === novi) return "Nalog je već u tom statusu.";
  return null;
}

/** Uređaj je kod klijenta (kupljen ili u najmu) — samo takvom se daje zamjenski. */
export function uredajKlijenta(stanjePrije: Stanje): boolean {
  return stanjePrije === "PRODAN" || stanjePrije === "U_NAJMU";
}

export type IshodZavrsetka =
  | {
      ok: true;
      /** radnja nad uređajem na servisu (null: prijava s portala, uređaj nije ni zaprimljen) */
      uredaj: "izlazSaServisa" | "otpis" | null;
      /** radnja nad zamjenskim uređajem (ako ga ima) */
      zamjena: "povratZamjene" | "zamjenaUNajam" | null;
      /** najam: zatvara se plan originala, a zamjenski ga nasljeđuje */
      najam: "ZATVORI" | "PRENESI" | null;
    }
  | { ok: false; razlog: string };

/**
 * Što završetak naloga radi s uređajem i zamjenskim:
 *  - VRACEN / OTKAZAN: uređaj se vraća u stanje prije servisa, zamjenski natrag na skladište;
 *  - OTPISAN: samo naš uređaj (na skladištu ili u najmu) — kupčev se vraća kupcu i kad je neispravan.
 *    Otpisani uređaj iz najma: s naplatom prestaje; ako klijent ima zamjenski, on ostaje u najmu umjesto njega.
 */
export function ishodZavrsetka(z: Zavrsetak, stanjePrije: Stanje, imaZamjenu: boolean, prijavljen = false): IshodZavrsetka {
  // prijava s portala prije zaprimanja: uređaj je kod klijenta, samo otkaz
  if (prijavljen)
    return z === "OTKAZAN"
      ? { ok: true, uredaj: null, zamjena: null, najam: null }
      : { ok: false, razlog: "Uređaj još nije zaprimljen — nalog se može samo otkazati." };
  if (z === "OTPISAN") {
    if (stanjePrije === "PRODAN") return { ok: false, razlog: "Uređaj je vlasništvo kupca — ne otpisuje se, nego vraća kupcu." };
    if (stanjePrije === "U_NAJMU")
      return { ok: true, uredaj: "otpis", zamjena: imaZamjenu ? "zamjenaUNajam" : null, najam: imaZamjenu ? "PRENESI" : "ZATVORI" };
    return { ok: true, uredaj: "otpis", zamjena: imaZamjenu ? "povratZamjene" : null, najam: null };
  }
  return { ok: true, uredaj: "izlazSaServisa", zamjena: imaZamjenu ? "povratZamjene" : null, najam: null };
}

/** Brisanje: samo tek zaprimljen nalog bez zamjenskog uređaja (sve ostalo se završava/otkazuje, da ostane trag). */
export function provjeriBrisanje(n: { status: string; imaoZamjenu: boolean }): string | null {
  if (n.status !== "ZAPRIMLJEN" && n.status !== "PRIJAVLJEN") return "Obrisati se može samo tek zaprimljen nalog — ostale otkažite.";
  if (n.imaoZamjenu) return "Nalog sa zamjenskim uređajem se ne briše — otkažite ga.";
  return null;
}

/** Zadnji dan naplate originala pri prijenosu najma na zamjenski: nikad prije kraja već fakturiranih mjeseci. */
export function krajNaplateOriginala(datum: string, zadnjiFakturiraniMjesec: string | null): string {
  if (!zadnjiFakturiraniMjesec) return datum;
  const [g, m] = zadnjiFakturiraniMjesec.split("-").map(Number) as [number, number];
  const kraj = new Date(Date.UTC(g, m, 0)).toISOString().slice(0, 10);
  return kraj > datum ? kraj : datum;
}

export function sljedeciDan(datum: string): string {
  return new Date(Date.parse(`${datum}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
}
