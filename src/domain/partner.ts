/**
 * Partner (kupac/dobavljač) — čista pravila: država, PDV broj, porezni status za PDV, eRačun adresa.
 */
import { jeOib } from "./oib";

/** Države članice EU (ISO 3166-1 alpha-2; Grčka u PDV broju koristi „EL“). */
export const EU_DRZAVE = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
] as const;

export function jeEuDrzava(drzava: string): boolean {
  return (EU_DRZAVE as readonly string[]).includes(drzava.toUpperCase());
}

/** Prefiks PDV broja za državu (Grčka: EL). */
export function prefiksPdv(drzava: string): string {
  return drzava.toUpperCase() === "GR" ? "EL" : drzava.toUpperCase();
}

/** Osnovni oblik PDV broja po državi (bez prefiksa) — VIES ionako provjerava konačno. */
const OBLIK_PDV: Record<string, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^[01]\d{9}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^\d[A-Z0-9+*]\d{5}[A-Z]{1,2}$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
};

/**
 * Čita PDV broj (npr. „DE 123 456 789“, „de123456789“) → „DE123456789“.
 * Ako prefiks nije upisan, dodaje se prefiks države partnera.
 */
export function procitajPdvBroj(upis: string, drzava: string): { ok: true; vrijednost: string } | { ok: false; greska: string } {
  const t = upis.replace(/[\s.\-]/g, "").toUpperCase();
  if (!t) return { ok: false, greska: "Upišite PDV broj." };
  const pref = prefiksPdv(drzava);
  const sPrefiksom = /^[A-Z]{2}/.test(t) && !/^\d/.test(t) && OBLIK_PDV[t.slice(0, 2)] ? t : pref + t;
  const p = sPrefiksom.slice(0, 2);
  const broj = sPrefiksom.slice(2);
  const oblik = OBLIK_PDV[p];
  if (!oblik) return { ok: false, greska: "PDV broj s tom oznakom države nije iz EU." };
  if (p !== pref) return { ok: false, greska: `PDV broj počinje s ${p}, a partner je iz države ${drzava.toUpperCase()}.` };
  if (!oblik.test(broj)) return { ok: false, greska: `PDV broj nije u ispravnom obliku za ${p}.` };
  if (p === "HR" && !jeOib(broj)) return { ok: false, greska: "Hrvatski PDV broj je HR + OIB; OIB nije ispravan." };
  return { ok: true, vrijednost: sPrefiksom };
}

/**
 * Porezni status partnera za PDV (koristi se pri izdavanju računa, korak 2.1):
 * - DOMACI: partner iz Hrvatske
 * - EU_OBVEZNIK: iz druge države EU s PDV brojem → prijenos porezne obveze (bez hrvatskog PDV-a)
 * - EU_NEOBVEZNIK: iz druge države EU bez PDV broja (građanin, neobveznik) → hrvatski PDV
 * - TRECA_ZEMLJA: izvan EU → izvoz / usluga izvan EU
 */
export const PDV_STATUSI = {
  DOMACI: "Domaći (Hrvatska)",
  EU_OBVEZNIK: "EU — obveznik PDV-a (prijenos obveze)",
  EU_NEOBVEZNIK: "EU — nije obveznik PDV-a",
  TRECA_ZEMLJA: "Treća zemlja (izvan EU)",
} as const;
export type PdvStatus = keyof typeof PDV_STATUSI;

export function izvedeniPdvStatus(drzava: string, pdvBroj: string | null | undefined): PdvStatus {
  const d = drzava.toUpperCase();
  if (d === "HR") return "DOMACI";
  if (jeEuDrzava(d)) return pdvBroj ? "EU_OBVEZNIK" : "EU_NEOBVEZNIK";
  return "TRECA_ZEMLJA";
}

/** Ručno postavljeni status ima prednost (npr. EU partner kojem VIES ne potvrđuje broj). */
export function pdvStatus(drzava: string, pdvBroj: string | null | undefined, rucno: string | null | undefined): PdvStatus {
  return rucno && rucno in PDV_STATUSI ? (rucno as PdvStatus) : izvedeniPdvStatus(drzava, pdvBroj);
}

/**
 * Adresa za eRačun (sudionik u sustavu razmjene): za hrvatske subjekte „9934:<OIB>“.
 * Upis može biti samo OIB ili puna oznaka „shema:identifikator“.
 */
export function procitajEracunAdresu(upis: string): { ok: true; vrijednost: string } | { ok: false; greska: string } {
  const t = upis.replace(/\s+/g, "");
  if (!t) return { ok: false, greska: "Upišite adresu za eRačun." };
  if (/^\d{11}$/.test(t)) return jeOib(t) ? { ok: true, vrijednost: `9934:${t}` } : { ok: false, greska: "OIB nije ispravan." };
  const m = /^(\d{4}):(.+)$/.exec(t);
  if (!m) return { ok: false, greska: "Adresa za eRačun je oblika 9934:OIB." };
  if (m[1] === "9934" && !jeOib(m[2]!)) return { ok: false, greska: "OIB u adresi za eRačun nije ispravan." };
  if (m[2]!.length > 100) return { ok: false, greska: "Adresa je preduga." };
  return { ok: true, vrijednost: `${m[1]}:${m[2]}` };
}

export function jePostanskiBrojHr(v: string): boolean {
  return /^[1-5]\d{4}$/.test(v);
}
