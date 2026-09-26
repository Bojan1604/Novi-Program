/** Troškovi (korak 4.5) — čista logika: ponavljajući troškovi i zbrojevi za grafikon. */
import { daniUMjesecu, mjesecOd, mjeseci, sljedeciMjesec, type Mjesec } from "./najam";

export const ZADANE_KATEGORIJE_TROSKOVA = ["Najam prostora", "Režije", "Plaće", "Prijevoz", "Telekomunikacije", "Usluge", "Roba", "Ostalo"] as const;

export type Ponavljajuci = {
  /** prvi mjesec i (neobavezno) zadnji mjesec */
  od: Mjesec;
  do: Mjesec | null;
  /** dan u mjesecu kad nastaje (1–31; kraći mjesec → zadnji dan) */
  dan: number;
  /** zadnji mjesec za koji je trošak već stvoren */
  zadnji: Mjesec | null;
};

/** Mjeseci za koje treba stvoriti trošak do danas (uključivo, ako je dan već došao). Drugo pokretanje ne stvara ništa. */
export function dospjeliMjeseci(p: Ponavljajuci, danas: string): { mjesec: Mjesec; datum: string }[] {
  if (!Number.isInteger(p.dan) || p.dan < 1 || p.dan > 31) return [];
  const pocetak = p.zadnji ? sljedeciMjesec(p.zadnji) : p.od;
  const kraj = p.do && p.do < mjesecOd(danas) ? p.do : mjesecOd(danas);
  if (pocetak > kraj) return [];
  return mjeseci(pocetak, kraj)
    .map((m) => ({ mjesec: m, datum: `${m}-${String(Math.min(p.dan, daniUMjesecu(m))).padStart(2, "0")}` }))
    .filter((x) => x.datum <= danas);
}

export type StavkaTroska = { datum: string; kategorija: string; iznos: number };

/** Zbrojevi po mjesecima i kategorijama (za grafikon), mjeseci od–do uključivo (i prazni). */
export function zbrojeviTroskova(stavke: readonly StavkaTroska[], od: Mjesec, doM: Mjesec) {
  const lista = mjeseci(od, doM);
  const kategorije = [...new Set(stavke.map((s) => s.kategorija))].sort((a, b) => a.localeCompare(b, "hr"));
  const po = new Map<string, number>();
  for (const s of stavke) {
    const k = `${mjesecOd(s.datum)}|${s.kategorija}`;
    po.set(k, (po.get(k) ?? 0) + s.iznos);
  }
  return {
    mjeseci: lista,
    kategorije,
    vrijednosti: lista.map((m) => kategorije.map((k) => po.get(`${m}|${k}`) ?? 0)),
    ukupno: lista.map((m) => kategorije.reduce((a, k) => a + (po.get(`${m}|${k}`) ?? 0), 0)),
  };
}
