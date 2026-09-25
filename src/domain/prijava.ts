/**
 * Pravila prijave — čista logika (bez baze).
 */

export const TRAJANJE_SESIJE_DANA = 14;
/** Istek sesije se u bazi produljuje najviše jednom u ovom razmaku. */
export const PRODULJENJE_SESIJE_MS = 60 * 60 * 1000;

export const PROZOR_POKUSAJA_MS = 15 * 60 * 1000;
export const NAJVISE_POGRESNIH_PO_EMAILU = 5;
export const NAJVISE_POGRESNIH_PO_IP = 20;

export const LOZINKA_NAJMANJE_ZNAKOVA = 10;
/** bcrypt uzima samo prva 72 bajta; dulju lozinku odbijamo umjesto da je tiho skratimo. */
export const LOZINKA_NAJVISE_BAJTOVA = 72;

export function normalizirajEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function jeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Provjera nove lozinke; vraća poruku greške ili null. */
export function provjeriNovuLozinku(lozinka: string, email: string): string | null {
  if (lozinka.length < LOZINKA_NAJMANJE_ZNAKOVA) {
    return `Lozinka mora imati najmanje ${LOZINKA_NAJMANJE_ZNAKOVA} znakova.`;
  }
  if (new TextEncoder().encode(lozinka).length > LOZINKA_NAJVISE_BAJTOVA) {
    return "Lozinka je preduga (najviše 72 znaka bez hrvatskih slova).";
  }
  if (lozinka.trim() !== lozinka) return "Lozinka ne smije počinjati ni završavati razmakom.";
  if (normalizirajEmail(lozinka) === normalizirajEmail(email)) return "Lozinka ne smije biti jednaka e-pošti.";
  if (/^(.)\1*$/.test(lozinka)) return "Lozinka ne smije biti jedan znak ponovljen.";
  return null;
}

export type Pokusaj = { vrijeme: Date; uspjeh: boolean };

export type OdlukaOPrijavi = { dopusteno: true } | { dopusteno: false; zakljucanoDo: Date; razlog: "email" | "ip" };

/**
 * Smije li se pokušati prijava.
 * - po e-pošti: 5 pogrešnih u 15 minuta (nakon zadnje uspješne) → zaključano 15 min od 5. pogrešne
 * - po IP-u: 20 pogrešnih u 15 minuta → zaključano 15 min od 20. pogrešne
 */
export function odluciOPrijavi(poEmailu: readonly Pokusaj[], poIp: readonly Pokusaj[], sada: Date): OdlukaOPrijavi {
  const emailDo = zakljucanoDo(pogresniOdZadnjegUspjeha(poEmailu), NAJVISE_POGRESNIH_PO_EMAILU, sada);
  const ipDo = zakljucanoDo(poIp.filter((p) => !p.uspjeh).map((p) => p.vrijeme), NAJVISE_POGRESNIH_PO_IP, sada);
  if (emailDo && (!ipDo || emailDo >= ipDo)) return { dopusteno: false, zakljucanoDo: emailDo, razlog: "email" };
  if (ipDo) return { dopusteno: false, zakljucanoDo: ipDo, razlog: "ip" };
  return { dopusteno: true };
}

function pogresniOdZadnjegUspjeha(pokusaji: readonly Pokusaj[]): Date[] {
  const zadnjiUspjeh = pokusaji.filter((p) => p.uspjeh).reduce<number>((m, p) => Math.max(m, p.vrijeme.getTime()), -Infinity);
  return pokusaji.filter((p) => !p.uspjeh && p.vrijeme.getTime() > zadnjiUspjeh).map((p) => p.vrijeme);
}

function zakljucanoDo(pogresni: Date[], najvise: number, sada: Date): Date | null {
  const od = sada.getTime() - PROZOR_POKUSAJA_MS;
  const uProzoru = pogresni.map((d) => d.getTime()).filter((t) => t > od && t <= sada.getTime()).sort((a, b) => a - b);
  if (uProzoru.length < najvise) return null;
  // zaključano dok najstariji od zadnjih `najvise` pogrešnih ne izađe iz prozora
  const kljucni = uProzoru[uProzoru.length - najvise]!;
  const kraj = kljucni + PROZOR_POKUSAJA_MS;
  return kraj > sada.getTime() ? new Date(kraj) : null;
}

export function istekSesije(sada: Date): Date {
  return new Date(sada.getTime() + TRAJANJE_SESIJE_DANA * 24 * 60 * 60 * 1000);
}

export function trebaProduljitiSesiju(zadnjaAktivnost: Date, sada: Date): boolean {
  return sada.getTime() - zadnjaAktivnost.getTime() >= PRODULJENJE_SESIJE_MS;
}

export type NacinSecure = "auto" | "uvijek" | "nikad";

/**
 * Kolačić prijave je `Secure` samo kad je zahtjev stigao preko HTTPS-a
 * (inače mobitel na http://192.168.x.x ne bi zadržao prijavu).
 */
export function kolacicSecure(protokol: string | null | undefined, nacin: NacinSecure = "auto"): boolean {
  if (nacin === "uvijek") return true;
  if (nacin === "nikad") return false;
  // x-forwarded-proto može biti lista („https, http“) — vrijedi prvi (najbliži klijentu)
  const prvi = (protokol ?? "").split(",")[0]?.trim().toLowerCase();
  return prvi === "https";
}

export function porukaZakljucano(zakljucanoDo: Date, sada: Date): string {
  const minuta = Math.max(1, Math.ceil((zakljucanoDo.getTime() - sada.getTime()) / 60_000));
  return `Previše neuspjelih pokušaja. Pokušajte ponovno za ${minuta} min.`;
}

/**
 * Putanja za povratak nakon prijave: samo relativna putanja unutar programa
 * (sprječava preusmjeravanje na tuđu stranicu).
 */
export function sigurnaPutanja(putanja: string | null | undefined): string {
  if (!putanja || !putanja.startsWith("/") || putanja.startsWith("//") || putanja.startsWith("/\\")) return "/";
  if (/[\r\n]/.test(putanja) || putanja.startsWith("/prijava")) return "/";
  return putanja;
}
