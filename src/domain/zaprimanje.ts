/**
 * Zaprimanje uređaja — čista logika: čitanje zalijepljenog stupca serijskih brojeva.
 */
import { provjeriSerijski } from "./stanja-uredaja";

export type RedakSerijskih = { red: number; izvorno: string; serijski: string | null; greska: string | null };

/**
 * Tekst iz Excela ili skenera → serijski brojevi. Svaki redak je jedan uređaj; u retku s više
 * stupaca (tab, točka-zarez) prvi stupac je serijski broj. Prazni retci se preskaču.
 * Dvostruki unos u istom popisu označava se greškom na drugom pojavljivanju.
 */
export function procitajSerijske(tekst: string): RedakSerijskih[] {
  const redovi = tekst.replace(/\r\n?/g, "\n").split("\n");
  const vidjeni = new Map<string, number>();
  const rezultat: RedakSerijskih[] = [];
  redovi.forEach((redak, i) => {
    const prvi = redak.split(/\t|;/)[0]!.trim();
    if (!prvi) return;
    const r = provjeriSerijski(prvi);
    if (!r.ok) {
      rezultat.push({ red: i + 1, izvorno: prvi, serijski: null, greska: r.greska });
      return;
    }
    const prije = vidjeni.get(r.vrijednost);
    if (prije !== undefined) {
      rezultat.push({ red: i + 1, izvorno: prvi, serijski: r.vrijednost, greska: `Već upisan u retku ${prije}.` });
      return;
    }
    vidjeni.set(r.vrijednost, i + 1);
    rezultat.push({ red: i + 1, izvorno: prvi, serijski: r.vrijednost, greska: null });
  });
  return rezultat;
}

/** Oznaka dokumenta: PRI-1/2026 (primka), MSK-3/2026 (međuskladišnica)… */
export function oznakaDokumenta(prefiks: string, redni: number, godina: number): string {
  return `${prefiks}-${redni}/${godina}`;
}
