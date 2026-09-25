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
export const TAJNA_POLJA = new Set(["lozinkaHash", "lozinka", "token", "totpTajna", "rezervniKodovi"]);

const ZANEMARENA = new Set(["id", "firmaId", "stvoreno", "azurirano", "verzija"]);

export const MASKA = "•••";

export function jeOsjetljivo(polje: string): boolean {
  return OSJETLJIVA_POLJA.has(polje);
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
  const osjetljiva = new Set([...OSJETLJIVA_POLJA, ...(opcije.osjetljiva ?? [])]);
  const zanemari = new Set([...ZANEMARENA, ...(opcije.zanemari ?? [])]);
  const polja = new Set([...Object.keys(staro ?? {}), ...Object.keys(novo ?? {})]);
  const promjene: Promjena[] = [];
  for (const polje of polja) {
    if (zanemari.has(polje)) continue;
    if (staro && novo && !(polje in novo)) continue;
    const s = uTekst(staro?.[polje]);
    const n = uTekst(novo?.[polje]);
    if (s === n) continue;
    const tajno = TAJNA_POLJA.has(polje);
    promjene.push({
      polje,
      staro: tajno && s !== null ? "(skriveno)" : s,
      novo: tajno && n !== null ? "(promijenjeno)" : n,
      ...(osjetljiva.has(polje) ? { osjetljivo: true } : {}),
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
      // što god piše u zapisu, poznata osjetljiva polja su uvijek osjetljiva
      ...(p["osjetljivo"] === true || OSJETLJIVA_POLJA.has(String(p["polje"])) ? { osjetljivo: true } : {}),
    }));
}

/** Tekst za pretragu ne smije sadržavati osjetljive vrijednosti (pretraga bi ih otkrila). */
export function tekstZaPretragu(opis: string, promjene: readonly Promjena[]): string {
  return [opis, ...promjene.filter((p) => !p.osjetljivo).flatMap((p) => [p.polje, p.staro ?? "", p.novo ?? ""])].join(" ").toLowerCase();
}
