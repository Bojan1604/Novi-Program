/**
 * Fiskalizacija računa (CIS Porezne uprave) — čista pravila (korak 2.10).
 * Pravila MORA potvrditi knjigovođa (Zakon o fiskalizaciji; od 2026. B2B računi idu kroz eRačun, korak 2.11).
 */

export const NACINI_FISKALIZACIJE = {
  ISKLJUCENA: "Isključena",
  DEMO: "Demo (bez slanja, izmišljeni JIR)",
  TEST: "Testni CIS (cistest.apis-it.hr)",
  PRODUKCIJA: "Produkcija (CIS Porezne uprave)",
} as const;
export type NacinFiskalizacije = keyof typeof NACINI_FISKALIZACIJE;

export const STATUSI_FISKALIZACIJE = {
  NIJE_POTREBNO: "Ne fiskalizira se",
  CEKA: "Čeka naknadnu dostavu",
  FISKALIZIRAN: "Fiskaliziran",
} as const;
export type StatusFiskalizacije = keyof typeof STATUSI_FISKALIZACIJE;

/**
 * Fiskalizira se račun plaćen gotovinom, karticom ili „ostalo“ te svaki račun građaninu (kupac bez OIB-a),
 * bez obzira na način plaćanja. Transakcijski račun poslovnom subjektu ide kao eRačun (fiskalizacija eRačuna).
 */
export function trebaFiskalizaciju(p: { vrsta: string; nacinPlacanja: string; kupacImaOib: boolean }): boolean {
  if (!["RACUN", "STORNO", "ODOBRENJE", "PREDUJAM"].includes(p.vrsta)) return false;
  return ["G", "K", "O"].includes(p.nacinPlacanja) || !p.kupacImaOib;
}

/** Datum i vrijeme za CIS: dd.MM.yyyyTHH:mm:ss (po Zagrebu). */
export function datumVrijemeCis(t: Date): string {
  const d = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(t);
  const g = (x: string) => d.find((p) => p.type === x)!.value;
  return `${g("day")}.${g("month")}.${g("year")}T${g("hour")}:${g("minute")}:${g("second")}`;
}

/** Iznos za CIS: dvije decimale s točkom, predznak za storno („-125.00“). */
export function iznosCis(centi: number): string {
  const a = Math.abs(centi);
  return `${centi < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/**
 * Ulaz za ZKI (potpisuje se privatnim ključem certifikata, pa MD5 potpisa):
 * OIB + datum i vrijeme (dd.MM.yyyy HH:mm:ss) + brojčana oznaka + oznaka prostora + oznaka uređaja + ukupni iznos.
 */
export function ulazZki(p: { oib: string; vrijeme: Date; redni: number; prostor: string; uredaj: string; ukupno: number }): string {
  return `${p.oib}${datumVrijemeCis(p.vrijeme).replace("T", " ")}${p.redni}${p.prostor}${p.uredaj}${iznosCis(p.ukupno)}`;
}

/** QR kod na računu za provjeru: s JIR-om, a dok ga nema sa ZKI-jem. Iznos u centima, vrijeme yyyyMMdd_HHmm. */
export function qrProvjere(p: { jir: string | null; zki: string; vrijeme: Date; ukupno: number }): string {
  const v = datumVrijemeCis(p.vrijeme);
  const datv = `${v.slice(6, 10)}${v.slice(3, 5)}${v.slice(0, 2)}_${v.slice(11, 13)}${v.slice(14, 16)}`;
  const oznaka = p.jir ? `jir=${p.jir}` : `zki=${p.zki}`;
  return `https://porezna.gov.hr/rn?${oznaka}&datv=${datv}&izn=${Math.abs(p.ukupno)}`;
}

/** Naknadna dostava: sljedeći pokušaj nakon 1, 5, 15, 60 min pa svakih 60 min (račun mora stići u 48 h). */
export function sljedeciPokusaj(pokusaja: number, sada: Date): Date {
  const minute = [1, 5, 15, 60][Math.min(pokusaja, 3)]!;
  return new Date(sada.getTime() + minute * 60_000);
}
