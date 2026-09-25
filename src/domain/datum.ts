/**
 * Datumi — čista logika, bez baze i ekrana.
 *
 * Poslovni datum (datum računa, dospijeće, razdoblje najma) je uvijek tekst
 * „YYYY-MM-DD“ po kalendaru u Europe/Zagreb. Nikad se ne računa s `Date`
 * u lokalnoj zoni poslužitelja: „danas“ se uvijek određuje za Zagreb.
 */

export const ZONA = "Europe/Zagreb";

/** Datum u obliku „YYYY-MM-DD“. */
export type Datum = string & { readonly __datum: unique symbol };

const zagrebFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Današnji datum u Zagrebu (trenutak se može zadati zbog testova). */
export function danas(trenutak: Date = new Date()): Datum {
  return datumUZagrebu(trenutak);
}

/** Kalendarski datum u Zagrebu za zadani trenutak (npr. vrijeme izdavanja). */
export function datumUZagrebu(trenutak: Date): Datum {
  if (Number.isNaN(trenutak.getTime())) throw new Error("Neispravan trenutak.");
  return zagrebFormat.format(trenutak) as Datum;
}

export function jeDatum(vrijednost: unknown): vrijednost is Datum {
  if (typeof vrijednost !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(vrijednost);
  if (!m) return false;
  const godina = Number(m[1]);
  const mjesec = Number(m[2]);
  const dan = Number(m[3]);
  return godina >= 1900 && godina <= 2999 && mjesec >= 1 && mjesec <= 12 && dan >= 1 && dan <= daniUMjesecu(godina, mjesec);
}

/** Pretvara tekst u Datum ili baca grešku. */
export function datum(vrijednost: string): Datum {
  if (!jeDatum(vrijednost)) throw new Error(`Neispravan datum: "${vrijednost}"`);
  return vrijednost;
}

/**
 * Čita datum koji je korisnik upisao: „25.9.2026“, „25.09.2026.“, „2026-09-25“.
 */
export function procitajDatum(upis: string): { ok: true; vrijednost: Datum } | { ok: false; greska: string } {
  const tekst = upis.trim();
  if (tekst === "") return { ok: false, greska: "Upišite datum." };

  let kandidat: string | null = null;
  const hr = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\.?$/.exec(tekst);
  if (hr) {
    kandidat = `${hr[3]}-${hr[2]!.padStart(2, "0")}-${hr[1]!.padStart(2, "0")}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(tekst)) {
    kandidat = tekst;
  }

  if (kandidat === null || !jeDatum(kandidat)) {
    return { ok: false, greska: "Datum nije ispravan (npr. 25.09.2026.)." };
  }
  return { ok: true, vrijednost: kandidat };
}

/** „2026-09-25“ → „25.09.2026.“ */
export function formatirajDatum(d: Datum): string {
  const [godina, mjesec, dan] = dijelovi(d);
  return `${pad2(dan)}.${pad2(mjesec)}.${godina}.`;
}

/** Negativno ako je a prije b, 0 ako su isti, pozitivno ako je a poslije b. */
export function usporedi(a: Datum, b: Datum): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function dodajDane(d: Datum, broj: number): Datum {
  if (!Number.isInteger(broj)) throw new Error("Broj dana mora biti cijeli broj.");
  const [godina, mjesec, dan] = dijelovi(d);
  const utc = new Date(Date.UTC(godina, mjesec - 1, dan + broj));
  return iz(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

/**
 * Dodaje mjesece; ako dan ne postoji u ciljnom mjesecu, uzima zadnji dan
 * (31.01. + 1 mjesec = 28.02. ili 29.02.).
 */
export function dodajMjesece(d: Datum, broj: number): Datum {
  if (!Number.isInteger(broj)) throw new Error("Broj mjeseci mora biti cijeli broj.");
  const [godina, mjesec, dan] = dijelovi(d);
  const ukupno = godina * 12 + (mjesec - 1) + broj;
  const novaGodina = Math.floor(ukupno / 12);
  const noviMjesec = (ukupno % 12) + 1;
  return iz(novaGodina, noviMjesec, Math.min(dan, daniUMjesecu(novaGodina, noviMjesec)));
}

/** Broj dana od a do b (b − a). */
export function razlikaUDanima(a: Datum, b: Datum): number {
  const [ga, ma, da] = dijelovi(a);
  const [gb, mb, db] = dijelovi(b);
  return Math.round((Date.UTC(gb, mb - 1, db) - Date.UTC(ga, ma - 1, da)) / 86_400_000);
}

export function daniUMjesecu(godina: number, mjesec: number): number {
  return new Date(Date.UTC(godina, mjesec, 0)).getUTCDate();
}

function dijelovi(d: Datum): [number, number, number] {
  if (!jeDatum(d)) throw new Error(`Neispravan datum: "${String(d)}"`);
  return [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))];
}

function iz(godina: number, mjesec: number, dan: number): Datum {
  return datum(`${String(godina).padStart(4, "0")}-${pad2(mjesec)}-${pad2(dan)}`);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const zagrebSat = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Pomak Zagreba od UTC-a u milisekundama u zadanom trenutku (+1 h zimi, +2 h ljeti). */
function pomakZagreba(trenutak: number): number {
  const d = Object.fromEntries(zagrebSat.formatToParts(new Date(trenutak)).map((p) => [p.type, p.value]));
  const kaoUtc = Date.UTC(Number(d["year"]), Number(d["month"]) - 1, Number(d["day"]), Number(d["hour"]), Number(d["minute"]), Number(d["second"]));
  return kaoUtc - Math.floor(trenutak / 1000) * 1000;
}

/** Trenutak ponoći zadanog dana po Zagrebu (za filtre „od–do“ nad vremenima). */
export function pocetakDana(d: Datum): Date {
  const [godina, mjesec, dan] = dijelovi(d);
  const ponocUtc = Date.UTC(godina, mjesec - 1, dan);
  const priblizno = ponocUtc - pomakZagreba(ponocUtc);
  return new Date(ponocUtc - pomakZagreba(priblizno));
}
