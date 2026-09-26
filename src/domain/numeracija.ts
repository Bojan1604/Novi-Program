/**
 * Numeracija i datumi dokumenata — čista pravila (korak 2.2).
 * Broj računa u RH: <redni broj>/<oznaka poslovnog prostora>/<oznaka naplatnog uređaja> (npr. 12/PP1/1),
 * redni broj kreće od 1 svake godine, bez rupa i bez ponavljanja.
 */
import { formatirajDatum, jeDatum, usporedi } from "./datum";

/** Oznaka poslovnog prostora: slova i brojke, 1–20 znakova (Zakon o fiskalizaciji). */
export function provjeriOznakuProstora(o: string): string | null {
  return /^[0-9A-Za-z]{1,20}$/.test(o) ? null : "Oznaka poslovnog prostora: 1–20 slova i brojki, bez razmaka.";
}

/** Oznaka naplatnog uređaja: cijeli broj 1–9999999. */
export function provjeriOznakuUredaja(o: string): string | null {
  return /^[1-9]\d{0,6}$/.test(o) ? null : "Oznaka naplatnog uređaja je cijeli broj (npr. 1).";
}

export function brojRacuna(redni: number, prostor: string, uredaj: string): string {
  return `${redni}/${prostor}/${uredaj}`;
}

/** Ključ brojača za račune: zaseban niz po poslovnom prostoru i naplatnom uređaju. */
export function vrstaBrojacaRacuna(vrsta: string, prostor: string, uredaj: string): string {
  return `${vrsta}:${prostor}:${uredaj}`;
}

/**
 * Datumi dokumenta:
 *  - datum ne u budućnosti;
 *  - ne raniji od zadnjeg izdanog u ISTOJ godini (brojač je po godini — račun od 31.12. ne blokira novu godinu);
 *  - dospijeće ne prije datuma.
 */
export function provjeriDatume(p: { datum: string; dospijece?: string | null; danas: string; zadnjiUGodini: string | null }): string | null {
  const { datum, dospijece, danas, zadnjiUGodini } = p;
  if (!jeDatum(datum) || !jeDatum(danas)) return "Datum nije ispravan.";
  if (usporedi(datum, danas) > 0) return "Datum dokumenta ne smije biti u budućnosti.";
  if (jeDatum(zadnjiUGodini) && usporedi(datum, zadnjiUGodini) < 0)
    return `Datum ne smije biti prije zadnjeg izdanog dokumenta te vrste (${formatirajDatum(zadnjiUGodini)}).`;
  if (dospijece !== undefined && dospijece !== null) {
    if (!jeDatum(dospijece)) return "Datum dospijeća nije ispravan.";
    if (usporedi(dospijece, datum) < 0) return "Dospijeće ne smije biti prije datuma dokumenta.";
  }
  return null;
}

/** Početni broj niza (prelazak sa starog programa usred godine): samo naprijed, nikad natrag. */
export function provjeriPocetniBroj(pocetni: number, zadnjiIzdani: number): string | null {
  if (!Number.isSafeInteger(pocetni) || pocetni < 1) return "Početni broj mora biti cijeli broj veći od 0.";
  if (pocetni <= zadnjiIzdani) return `Već je izdan broj ${zadnjiIzdani} — početni broj mora biti veći.`;
  return null;
}
