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
  "primke.zaprimi": { modul: "uredaji", razina: "operativno" },
  "primke.provjera": { modul: "uredaji", razina: "operativno" },
  "primke.storno": { modul: "uredaji", razina: "puno" },
  "uredaji.ispravak": { modul: "uredaji", razina: "operativno" },
  "uredaji.obrisi": { modul: "uredaji", razina: "puno" },
  "uredaji.prilogDodaj": { modul: "uredaji", razina: "operativno" },
  "uredaji.prilogObrisi": { modul: "uredaji", razina: "operativno" },
  "skeniranje.provjera": { modul: "uredaji", razina: "pregled" },
  "skladisni.izdaj": { modul: "uredaji", razina: "operativno" },
  "odobrenja.odluci": { modul: "uredaji", razina: "puno" },
  "inventure.uredi": { modul: "uredaji", razina: "operativno" },
  "prodaja.spremi": { modul: "prodaja", razina: "operativno" },
  "prodaja.izdaj": { modul: "prodaja", razina: "operativno" },
  "prodaja.pretvori": { modul: "prodaja", razina: "operativno" },
  "prodaja.obrisi": { modul: "prodaja", razina: "operativno" },
  "prodaja.podaci": { modul: "prodaja", razina: "operativno" },
  "uplate.unos": { modul: "prodaja", razina: "operativno" },
  "prodaja.storno": { modul: "prodaja", razina: "puno" },
  "eposta.slanje": { modul: "prodaja", razina: "operativno" },
  "postavke.spremi": { modul: "postavke", razina: "puno" },
  "prodaja.odobrenje": { modul: "prodaja", razina: "puno" },
  "uplate.ponisti": { modul: "prodaja", razina: "puno" },
  "eracun.posalji": { modul: "prodaja", razina: "operativno" },
  "eracun.izvjestaji": { modul: "prodaja", razina: "puno" },
  "najam.ugovor": { modul: "najam", razina: "operativno" },
  "najam.otkaz": { modul: "najam", razina: "puno" },
  "najam.prilozi": { modul: "najam", razina: "operativno" },
  "najam.izdaj": { modul: "najam", razina: "operativno" },
  "najam.izvan": { modul: "najam", razina: "operativno" },
  "najam.povrat": { modul: "najam", razina: "operativno" },
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
  "/primke": { naziv: "Primke", modul: "uredaji", razina: "pregled" },
  "/uredaji": { naziv: "Uređaji", modul: "uredaji", razina: "pregled" },
  "/skeniranje": { naziv: "Skeniranje", modul: "uredaji", razina: "pregled" },
  "/skladisni": { naziv: "Skladišni dokumenti", modul: "uredaji", razina: "pregled" },
  "/odobrenja": { naziv: "Odobrenja", modul: "uredaji", razina: "operativno" },
  "/inventure": { naziv: "Inventure", modul: "uredaji", razina: "pregled" },
  "/ponude": { naziv: "Ponude i predračuni", modul: "prodaja", razina: "pregled" },
  "/racuni": { naziv: "Računi", modul: "prodaja", razina: "pregled" },
  "/eracuni": { naziv: "eRačuni", modul: "prodaja", razina: "pregled" },
  "/najam": { naziv: "Ugovori o najmu", modul: "najam", razina: "pregled" },
  "/najam/rate": { naziv: "Rate za izdati", modul: "najam", razina: "operativno" },
  "/marze": { naziv: "Marže", modul: "prodaja", razina: "pregled", posebno: "costs" },
  "/postavke": { naziv: "Postavke firme", modul: "postavke", razina: "pregled" },
} as const satisfies Record<string, { naziv: string } & PotrebnoPravo>;

export type PutanjaStranice = keyof typeof STRANICE;

/** Tko smije preuzeti prilog, po vrsti zapisa uz koji je (isto pravo kao za pregled tog zapisa). */
export const PRAVA_PRILOGA: Record<string, PotrebnoPravo> = {
  Uredaj: { modul: "uredaji", razina: "pregled" },
  UgovorNajma: { modul: "najam", razina: "pregled" },
};
