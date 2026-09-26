/**
 * Pravila prijave — čista logika (bez baze).
 */

export const TRAJANJE_SESIJE_DANA = 14;
/** Istek sesije se u bazi produljuje najviše jednom u ovom razmaku. */
export const PRODULJENJE_SESIJE_MS = 60 * 60 * 1000;

export const PROZOR_POKUSAJA_MS = 15 * 60 * 1000;
/** ista e-pošta s iste adrese (pogađanje lozinke jednog korisnika) */
export const NAJVISE_POGRESNIH_EMAIL_IP = 5;
/** ista adresa, bilo koja e-pošta (pogađanje više računa) */
export const NAJVISE_POGRESNIH_PO_IP = 20;
/**
 * ista e-pošta s bilo koje adrese (raspodijeljeni napad). Namjerno visoko: inače bi bilo tko
 * mogao s pet pokušaja zaključati administratora (pravi korisnik je na drugoj adresi).
 */
export const NAJVISE_POGRESNIH_PO_EMAILU = 50;

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

export type Pokusaj = { vrijeme: Date; uspjeh: boolean; ip: string };

export type OdlukaOPrijavi = { dopusteno: true } | { dopusteno: false; zakljucanoDo: Date; razlog: "email" | "ip" };

/**
 * Smije li se pokušati prijava (pokušaji iz zadnjih 15 min):
 * - ista e-pošta s iste adrese: 5 pogrešnih (nakon zadnje uspješne)
 * - ista adresa: 20 pogrešnih (bilo koja e-pošta)
 * - ista e-pošta s bilo koje adrese: 50 pogrešnih
 * Zaključano je 15 min od najstarijeg pokušaja koji je prešao granicu.
 */
export function odluciOPrijavi(poEmailu: readonly Pokusaj[], poIp: readonly Pokusaj[], ip: string, sada: Date): OdlukaOPrijavi {
  const emailPogresni = pogresniOdZadnjegUspjeha(poEmailu);
  const kandidati: { do: Date | null; razlog: "email" | "ip" }[] = [
    { do: zakljucanoDo(pogresniOdZadnjegUspjeha(poEmailu.filter((p) => p.ip === ip)), NAJVISE_POGRESNIH_EMAIL_IP, sada), razlog: "email" },
    { do: zakljucanoDo(emailPogresni, NAJVISE_POGRESNIH_PO_EMAILU, sada), razlog: "email" },
    {
      do: zakljucanoDo(
        poIp.filter((p) => !p.uspjeh).map((p) => p.vrijeme),
        NAJVISE_POGRESNIH_PO_IP,
        sada,
      ),
      razlog: "ip",
    },
  ];
  const najkasnije = kandidati.filter((k) => k.do).sort((a, b) => b.do!.getTime() - a.do!.getTime())[0];
  return najkasnije ? { dopusteno: false, zakljucanoDo: najkasnije.do!, razlog: najkasnije.razlog } : { dopusteno: true };
}

function pogresniOdZadnjegUspjeha(pokusaji: readonly Pokusaj[]): Date[] {
  const zadnjiUspjeh = pokusaji.filter((p) => p.uspjeh).reduce<number>((m, p) => Math.max(m, p.vrijeme.getTime()), -Infinity);
  return pokusaji.filter((p) => !p.uspjeh && p.vrijeme.getTime() > zadnjiUspjeh).map((p) => p.vrijeme);
}

function zakljucanoDo(pogresni: Date[], najvise: number, sada: Date): Date | null {
  const od = sada.getTime() - PROZOR_POKUSAJA_MS;
  const uProzoru = pogresni
    .map((d) => d.getTime())
    .filter((t) => t > od && t <= sada.getTime())
    .sort((a, b) => a - b);
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
 * (sprječava preusmjeravanje na tuđu stranicu). Putanja se raščlanjuje kao što bi to
 * napravio preglednik (koji npr. briše TAB: „/\t/zlo.com“ → „//zlo.com“) i mora ostati na istom poslužitelju.
 */
export function sigurnaPutanja(putanja: string | null | undefined): string {
  if (!putanja || !putanja.startsWith("/")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(putanja)) return "/";
  let url: URL;
  try {
    url = new URL(putanja, "http://erp-wms.invalid");
  } catch {
    return "/";
  }
  if (url.origin !== "http://erp-wms.invalid" || url.pathname.startsWith("//")) return "/";
  if (url.pathname === "/prijava" || url.pathname.startsWith("/prijava/")) return "/";
  return url.pathname + url.search;
}

/** Firma u koju prijava ulazi: zadnja u kojoj je korisnik radio (ako je članstvo još aktivno), inače najstarije članstvo. */
export function odaberiClanstvo<T extends { firmaId: string }>(clanstva: readonly T[], zadnjaFirmaId: string | null): T | undefined {
  return clanstva.find((c) => c.firmaId === zadnjaFirmaId) ?? clanstva[0];
}
