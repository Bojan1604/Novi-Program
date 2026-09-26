/**
 * Skladišni dokumenti bez prodaje — čista pravila: vrste, koja radnja nad uređajem, što mora biti upisano.
 * Stanje uređaja mijenja se i dalje samo kroz `prijelaz` (src/domain/stanja-uredaja.ts).
 */
import { STANJA, type Stanje, type VrstaRadnje } from "./stanja-uredaja";

export const VRSTE_DOKUMENATA = {
  MEDJUSKLADISNICA: { naziv: "Međuskladišnica", prefiks: "MSK", brojac: "medjuskladisnica", trebaOdobrenje: false },
  IZLAZ: { naziv: "Izlaz", prefiks: "IZL", brojac: "izlaz", trebaOdobrenje: true },
  POVRAT: { naziv: "Povrat", prefiks: "POV", brojac: "povrat", trebaOdobrenje: false },
} as const;
export type VrstaDokumenta = keyof typeof VRSTE_DOKUMENATA;
export const POPIS_VRSTA = Object.keys(VRSTE_DOKUMENATA) as VrstaDokumenta[];

export const STATUSI_DOKUMENTA = { IZDAN: "Izdan", CEKA_ODOBRENJE: "Čeka odobrenje", ODBIJEN: "Odbijen" } as const;
export type StatusDokumenta = keyof typeof STATUSI_DOKUMENTA;

/** Razlozi izlaza — uređaj trajno napušta skladište (nije prodaja ni najam). */
export const RAZLOZI_IZLAZA = [
  "Oštećen",
  "Zastario",
  "Krađa ili gubitak",
  "Povrat dobavljaču",
  "Donacija",
  "Za rezervne dijelove",
  "Ostalo",
] as const;

export function jeVrsta(v: unknown): v is VrstaDokumenta {
  return typeof v === "string" && Object.hasOwn(VRSTE_DOKUMENATA, v);
}

/** Koja radnja nad uređajem za vrstu dokumenta (povrat ovisi o tome odakle se uređaj vraća). */
export function radnjaDokumenta(vrsta: VrstaDokumenta, stanje: Stanje): VrstaRadnje | null {
  if (vrsta === "MEDJUSKLADISNICA") return "medjuskladisnica";
  if (vrsta === "IZLAZ") return "otpis";
  if (stanje === "U_NAJMU") return "povratIzNajma";
  if (stanje === "OTPISAN") return "ponistenjeOtpisa";
  return null;
}

export type ZaglavljeDokumenta = {
  vrsta: VrstaDokumenta;
  skladisteIzId: string | null;
  skladisteUId: string | null;
  razlog: string | null;
};

/** Obavezni podaci po vrsti. Vraća poruku za korisnika ili null. */
export function provjeriZaglavlje(z: ZaglavljeDokumenta): string | null {
  if (z.vrsta === "MEDJUSKLADISNICA") {
    if (!z.skladisteIzId || !z.skladisteUId) return "Odaberite skladište iz kojeg i u koje se uređaji premještaju.";
    if (z.skladisteIzId === z.skladisteUId) return "Skladište „iz“ i „u“ ne smije biti isto.";
  }
  if (z.vrsta === "IZLAZ") {
    if (!z.skladisteIzId) return "Odaberite skladište iz kojeg uređaji izlaze.";
    if (!z.razlog) return "Odaberite razlog izlaza.";
  }
  if (z.vrsta === "POVRAT" && !z.skladisteUId) return "Odaberite skladište na koje se uređaji vraćaju.";
  return null;
}

export type UredajZaDokument = { serijski: string; stanje: Stanje; skladisteId: string | null };

/**
 * Smije li uređaj na dokument — provjera prije prijelaza, s razlogom specifičnim za dokument
 * (npr. međuskladišnica: uređaj mora biti baš u skladištu „iz“).
 */
export function provjeriUredaj(z: ZaglavljeDokumenta, u: UredajZaDokument): string | null {
  if ((z.vrsta === "MEDJUSKLADISNICA" || z.vrsta === "IZLAZ") && u.skladisteId !== z.skladisteIzId) {
    return `Uređaj ${u.serijski} nije u odabranom skladištu (${STANJA[u.stanje]}).`;
  }
  if (z.vrsta === "POVRAT" && !radnjaDokumenta("POVRAT", u.stanje)) {
    return `Uređaj ${u.serijski} je „${STANJA[u.stanje]}“ — povrat je moguć za uređaje iz najma i otpisane (prodani se vraćaju stornom računa).`;
  }
  return null;
}
