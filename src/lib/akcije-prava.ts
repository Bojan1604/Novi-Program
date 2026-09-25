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
  "racun.lozinka": { samoPrijava: true },
  "sifrarnici.spremi": { modul: "sifrarnici", razina: "operativno" },
  "sifrarnici.aktivnost": { modul: "sifrarnici", razina: "operativno" },
  "sifrarnici.obrisi": { modul: "sifrarnici", razina: "puno" },
  "partneri.spremi": { modul: "partneri", razina: "operativno" },
  "partneri.aktivnost": { modul: "partneri", razina: "operativno" },
  "partneri.obrisi": { modul: "partneri", razina: "puno" },
  "partneri.dohvat": { modul: "partneri", razina: "operativno" },
  "partneri.vies": { modul: "partneri", razina: "operativno" },
  "poslovnice.spremi": { modul: "partneri", razina: "operativno" },
  "cjenici.spremi": { modul: "partneri", razina: "operativno" },
  "cjenici.stavka": { modul: "partneri", razina: "operativno" },
} as const satisfies Record<string, PotrebnoPravo>;

export type KljucAkcije = keyof typeof AKCIJE;

/** Stranice i koje pravo traže (za izbornik i provjeru pristupa). */
export const STRANICE = {
  "/": { naziv: "Nadzorna ploča", modul: "nadzorna", razina: "pregled" },
  "/korisnici": { naziv: "Korisnici", modul: "korisnici", razina: "pregled" },
  "/uloge": { naziv: "Uloge i prava", modul: "korisnici", razina: "pregled" },
  "/dnevnik": { naziv: "Dnevnik promjena", posebno: "log" },
  "/sifrarnici": { naziv: "Šifrarnici", modul: "sifrarnici", razina: "pregled" },
  "/moj-racun": { naziv: "Moj račun", samoPrijava: true },
  "/partneri": { naziv: "Partneri", modul: "partneri", razina: "pregled" },
  "/cjenici": { naziv: "Cjenici", modul: "partneri", razina: "pregled" },
} as const satisfies Record<string, { naziv: string } & PotrebnoPravo>;

export type PutanjaStranice = keyof typeof STRANICE;
