/**
 * Parametri popisa (stranica, veličina, sortiranje, filtri) iz URL-a — čista logika.
 * Sve što dolazi iz URL-a je nepouzdano: nepoznato sortiranje i veličine se odbacuju.
 */

export type Smjer = "asc" | "desc";
export type Sortiranje<K extends string> = { kljuc: K; smjer: Smjer };

export const VELICINE_STRANICE = [25, 50, 100, 200] as const;
export const ZADANA_VELICINA = 50;

export type ParametriUrl = Record<string, string | string[] | undefined>;

export function jedan(v: string | string[] | undefined): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  return x === undefined || x.trim() === "" ? undefined : x.trim();
}

/** Više vrijednosti: ?status=a&status=b ili ?status=a,b — bez praznih i duplikata. */
export function vise(v: string | string[] | undefined): string[] {
  const niz = Array.isArray(v) ? v : v === undefined ? [] : [v];
  return [
    ...new Set(
      niz
        .flatMap((x) => x.split(","))
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}

export function stranica(v: string | string[] | undefined): number {
  const n = Number(jedan(v));
  return Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : 1;
}

export function velicina(v: string | string[] | undefined): number {
  const n = Number(jedan(v));
  return (VELICINE_STRANICE as readonly number[]).includes(n) ? n : ZADANA_VELICINA;
}

export function sortiranje<K extends string>(sp: ParametriUrl, dopusteno: readonly K[], zadano: Sortiranje<K>): Sortiranje<K> {
  const k = jedan(sp["sort"]);
  const s = jedan(sp["smjer"]);
  if (!k || !(dopusteno as readonly string[]).includes(k)) return zadano;
  return { kljuc: k as K, smjer: s === "desc" ? "desc" : "asc" };
}

/** URL popisa s promijenjenim parametrima (null briše); stranica se vraća na 1 kad se mijenja išta osim stranice. */
export function urlPopisa(putanja: string, sp: ParametriUrl, izmjene: Record<string, string | string[] | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k in izmjene || v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) if (x !== "") p.append(k, x);
  }
  for (const [k, v] of Object.entries(izmjene)) {
    if (v === null) continue;
    for (const x of Array.isArray(v) ? v : [v]) if (x !== "") p.append(k, x);
  }
  if (!("stranica" in izmjene)) p.delete("stranica");
  if (p.get("stranica") === "1") p.delete("stranica");
  const q = p.toString();
  return q ? `${putanja}?${q}` : putanja;
}

/** Sljedeći smjer kad se klikne na naslov stupca. */
export function sljedeciSmjer<K extends string>(trenutno: Sortiranje<K>, kljuc: K): Smjer {
  return trenutno.kljuc === kljuc && trenutno.smjer === "asc" ? "desc" : "asc";
}
