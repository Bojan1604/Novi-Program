/**
 * Dnevnik promjena — čista logika: razlika između starog i novog stanja i maskiranje
 * osjetljivih podataka (nabavne cijene, marže) za korisnike bez prava.
 */

export type Promjena = { polje: string; staro: string | null; novo: string | null; osjetljivo?: boolean };

/** Polja koja otkrivaju nabavne cijene ili marže — vidi ih samo korisnik s pravom „costs“. */
export const OSJETLJIVA_POLJA = new Set([
  "nabavnaCijena",
  "nabavnaVrijednost",
  "nabavniIznos",
  "trosakRobe",
  "trosak",
  "marza",
  "marzaPostotak",
  "zarada",
]);

/** Polja koja se nikad ne zapisuju (tajne). */
export const TAJNA_POLJA = new Set(["lozinkaHash", "lozinka", "token", "totpTajna", "rezervniKodovi", "smtpLozinka"]);

const ZANEMARENA = new Set(["id", "firmaId", "stvoreno", "azurirano", "verzija"]);

export const MASKA = "•••";

/** Vrste zapisa u dnevniku (entitet) i nazivi za prikaz. Nova vrsta = novi unos. */
export const NAZIVI_ENTITETA: Record<string, string> = {
  Firma: "Firma",
  Korisnik: "Korisnik",
  Uloga: "Uloga",
  Izvoz: "Izvoz",
  Kategorija: "Kategorija",
  Proizvodjac: "Proizvođač",
  ModelUredaja: "Model uređaja",
  Skladiste: "Skladište",
  StanjeRobe: "Stanje robe",
  Usluga: "Usluga",
  Partner: "Partner",
  Cjenik: "Cjenik",
  Uredaj: "Uređaj",
  Primka: "Primka",
  Prilog: "Prilog",
  SkladisniDokument: "Skladišni dokument",
  Odobrenje: "Odobrenje",
  UgovorNajma: "Ugovor o najmu",
  Narudzbenica: "Narudžbenica",
  UlazniRacun: "Ulazni račun",
  Trosak: "Trošak",
  PonavljajuciTrosak: "Ponavljajući trošak",
  Inventura: "Inventura",
  ProdajniDokument: "Prodajni dokument",
  Uplata: "Uplata",
};

const OSJETLJIVA_MALA = new Set([...OSJETLJIVA_POLJA].map((p) => p.toLowerCase()));
const TAJNA_MALA = new Set([...TAJNA_POLJA].map((p) => p.toLowerCase()));

/** Naziv polja otkriva nabavnu cijenu/maržu (bez obzira na velika slova). */
export function jeOsjetljivo(polje: string): boolean {
  return OSJETLJIVA_MALA.has(polje.toLowerCase());
}

function jeTajno(polje: string): boolean {
  return TAJNA_MALA.has(polje.toLowerCase());
}

/** Sadrži li vrijednost (i u ugniježđenim objektima/nizovima) osjetljivo polje. */
function sadrziOsjetljivo(v: unknown, dodatna: ReadonlySet<string>): boolean {
  if (Array.isArray(v)) return v.some((x) => sadrziOsjetljivo(x, dodatna));
  if (v && typeof v === "object" && !(v instanceof Date) && !("toFixed" in v)) {
    return Object.entries(v).some(([k, x]) => jeOsjetljivo(k) || dodatna.has(k.toLowerCase()) || sadrziOsjetljivo(x, dodatna));
  }
  return false;
}

/** Tajne (lozinke, tokeni) zamijenjene i u ugniježđenim objektima. */
function bezTajni(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(bezTajni);
  if (v && typeof v === "object" && !(v instanceof Date) && !("toFixed" in v)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jeTajno(k) ? "(skriveno)" : bezTajni(x)]));
  }
  return v;
}

/** Vrijednost u tekst za dnevnik (datumi, Decimal, JSON). */
export function uTekst(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("toFixed" in v && typeof (v as { toString: unknown }).toString === "function") return String(v); // Prisma Decimal
    return JSON.stringify(v);
  }
  return String(v);
}

/**
 * Razlika između starog i novog stanja zapisa. Polje koje ne postoji u `novo`
 * se ne smatra promijenjenim (djelomična izmjena).
 */
export function razlika(
  staro: Record<string, unknown> | null,
  novo: Record<string, unknown> | null,
  opcije: { osjetljiva?: readonly string[]; zanemari?: readonly string[] } = {},
): Promjena[] {
  const dodatna = new Set((opcije.osjetljiva ?? []).map((p) => p.toLowerCase()));
  const zanemari = new Set([...ZANEMARENA, ...(opcije.zanemari ?? [])]);
  const polja = new Set([...Object.keys(staro ?? {}), ...Object.keys(novo ?? {})]);
  const promjene: Promjena[] = [];
  for (const polje of polja) {
    if (zanemari.has(polje)) continue;
    if (staro && novo && !(polje in novo)) continue;
    const st = staro?.[polje];
    const nv = novo?.[polje];
    const s = uTekst(bezTajni(st));
    const n = uTekst(bezTajni(nv));
    if (s === n && uTekst(st) === uTekst(nv)) continue;
    const tajno = jeTajno(polje);
    promjene.push({
      polje,
      staro: tajno && s !== null ? "(skriveno)" : s,
      novo: tajno && n !== null ? "(promijenjeno)" : n,
      ...(jeOsjetljivo(polje) || dodatna.has(polje.toLowerCase()) || sadrziOsjetljivo(st, dodatna) || sadrziOsjetljivo(nv, dodatna)
        ? { osjetljivo: true }
        : {}),
    });
  }
  return promjene.sort((a, b) => a.polje.localeCompare(b.polje));
}

/** Osjetljive vrijednosti zamijenjene maskom ako korisnik nema pravo na nabavne cijene. */
export function maskiraj(promjene: readonly Promjena[], vidiNabavne: boolean): Promjena[] {
  if (vidiNabavne) return promjene.map((p) => ({ ...p }));
  return promjene.map((p) => (p.osjetljivo ? { ...p, staro: p.staro === null ? null : MASKA, novo: p.novo === null ? null : MASKA } : { ...p }));
}

/** Iz spremljenog JSON-a (nepouzdano) u promjene. */
export function procitajPromjene(v: unknown): Promjena[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null && typeof (p as { polje?: unknown }).polje === "string")
    .map((p) => ({
      polje: String(p["polje"]),
      staro: p["staro"] === null || p["staro"] === undefined ? null : String(p["staro"]),
      novo: p["novo"] === null || p["novo"] === undefined ? null : String(p["novo"]),
      // što god piše u zapisu, poznata osjetljiva polja (i ugniježđena) su uvijek osjetljiva
      ...(p["osjetljivo"] === true || jeOsjetljivo(String(p["polje"])) || sadrziOsjetljivoTekst(p["staro"]) || sadrziOsjetljivoTekst(p["novo"])
        ? { osjetljivo: true }
        : {}),
    }));
}

/** Tekst za pretragu ne smije sadržavati osjetljive vrijednosti (pretraga bi ih otkrila). */
export function tekstZaPretragu(opis: string, promjene: readonly Promjena[]): string {
  return [opis, ...promjene.filter((p) => !p.osjetljivo).flatMap((p) => [p.polje, p.staro ?? "", p.novo ?? ""])].join(" ").toLowerCase();
}

/** Spremljeni JSON (tekst) sadrži li ključ osjetljivog polja. */
function sadrziOsjetljivoTekst(v: unknown): boolean {
  if (typeof v !== "string" || (!v.startsWith("{") && !v.startsWith("["))) return false;
  try {
    return sadrziOsjetljivo(JSON.parse(v), new Set());
  } catch {
    return false;
  }
}
