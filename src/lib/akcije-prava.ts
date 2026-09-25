import { imaPosebno, imaPravo, type Modul, type Posebno, type Prava, type Razina } from "@/domain/prava";

export type PotrebnoPravo = { modul: Modul; razina: Razina; posebno?: Posebno } | { posebno: Posebno; modul?: undefined };

/**
 * SVE server akcije i koje pravo traže. Akcija se ne može izvesti ako nije na ovom popisu
 * (`akcija("kljuc", …)` prima samo ove ključeve), a test prava prolazi kroz sve uloge × sve akcije.
 */
export const AKCIJE = {
  "korisnici.dodaj": { modul: "korisnici", razina: "puno" },
  "korisnici.uredi": { modul: "korisnici", razina: "puno" },
  "korisnici.lozinka": { modul: "korisnici", razina: "puno" },
  "uloge.spremi": { modul: "korisnici", razina: "puno" },
  "uloge.obrisi": { modul: "korisnici", razina: "puno" },
} as const satisfies Record<string, PotrebnoPravo>;

export type KljucAkcije = keyof typeof AKCIJE;

/** Stranice i koje pravo traže (za izbornik i provjeru pristupa). */
export const STRANICE = {
  "/": { naziv: "Nadzorna ploča", modul: "nadzorna", razina: "pregled" },
  "/korisnici": { naziv: "Korisnici", modul: "korisnici", razina: "pregled" },
  "/uloge": { naziv: "Uloge i prava", modul: "korisnici", razina: "pregled" },
} as const satisfies Record<string, { naziv: string; modul: Modul; razina: Razina }>;

export type PutanjaStranice = keyof typeof STRANICE;

export function zadovoljava(prava: Prava, pravo: PotrebnoPravo): boolean {
  if (pravo.modul && !imaPravo(prava, pravo.modul, pravo.razina)) return false;
  if (pravo.posebno && !imaPosebno(prava, pravo.posebno)) return false;
  return true;
}
