import type { PotrebnoPravo } from "@/domain/prava";

export { zadovoljava, type PotrebnoPravo } from "@/domain/prava";

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
  "/dnevnik": { naziv: "Dnevnik promjena", posebno: "log" },
} as const satisfies Record<string, { naziv: string } & PotrebnoPravo>;

export type PutanjaStranice = keyof typeof STRANICE;
