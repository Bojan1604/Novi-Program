import { formatirajIznos } from "@/domain/novac";
import type { Polje } from "@/domain/polja";
import type { Sortiranje } from "@/domain/popis";
import type { DbFirme } from "@/lib/firma-db";
import { jeDecimalno, SIFRARNICI, type DefinicijaSifrarnika } from "@/lib/sifrarnici";
import { delegat, izBaze } from "@/services/sifrarnici";

/** Naziv veze za polje reference: proizvodjacId → proizvodjac */
const veza = (p: Polje) => p.ime.replace(/Id$/, "");

export function vidljivaPolja(def: DefinicijaSifrarnika, vidiNabavne: boolean): Polje[] {
  return def.polja.filter((p) => vidiNabavne || !p.osjetljivo);
}

/** Vrijednost polja za prikaz u popisu. */
export function prikazPolja(p: Polje, z: Record<string, unknown>): string {
  const v = z[p.ime];
  if (p.vrsta === "odabir" && p.izvor) return ((z[veza(p)] as { naziv?: string } | null)?.naziv ?? "") as string;
  if (v === null || v === undefined || v === "") return "";
  if (jeDecimalno(p)) {
    const c = Math.round(Number(v) * 100);
    return p.vrsta === "postotak" ? `${formatirajIznos(c)} %` : `${formatirajIznos(c)} €`;
  }
  if (p.vrsta === "kvacica") return v ? "da" : "";
  return String(v);
}

export type FilterSifrarnika = { trazi?: string; aktivnost: string[]; sort: Sortiranje<"naziv" | "stvoreno">; stranica: number; velicina: number };

export async function popisSifrarnika(db: DbFirme, firmaId: string, def: DefinicijaSifrarnika, f: FilterSifrarnika, vidiNabavne: boolean) {
  const where: Record<string, unknown> = { firmaId };
  if (f.trazi) where["naziv"] = { contains: f.trazi, mode: "insensitive" };
  if (f.aktivnost.length === 1) where["aktivan"] = f.aktivnost[0] === "aktivni";
  const include = Object.fromEntries(def.polja.filter((p) => p.vrsta === "odabir" && p.izvor).map((p) => [veza(p), { select: { naziv: true } }]));
  const d = delegat(db as never, def.model);
  const [ukupno, zapisi] = await Promise.all([
    d.count({ where }),
    d.findMany({
      where,
      ...(Object.keys(include).length ? { include } : {}),
      orderBy: [{ [f.sort.kljuc]: f.sort.smjer }, { id: "asc" }],
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
    }),
  ]);
  const polja = vidljivaPolja(def, vidiNabavne);
  return {
    ukupno,
    redovi: zapisi.map((z) => ({ id: z.id, aktivan: z.aktivan, vrijednosti: Object.fromEntries(polja.map((p) => [p.ime, prikazPolja(p, z)])) })),
  };
}

/** Zapis za obrazac (Decimal → centi); osjetljiva polja izostavljena bez prava. */
export async function zapisSifrarnika(db: DbFirme, firmaId: string, def: DefinicijaSifrarnika, id: string, vidiNabavne: boolean) {
  const z = await delegat(db as never, def.model).findFirst({ where: { id, firmaId } });
  if (!z) return null;
  const v = izBaze(def, z);
  for (const p of def.polja) if (p.osjetljivo && !vidiNabavne) delete v[p.ime];
  return { id: z.id, naziv: z.naziv, aktivan: z.aktivan, vrijednosti: v };
}

/** Opcije za polja odabira (aktivni zapisi + trenutno odabrani iako deaktiviran). */
export async function opcijeOdabira(db: DbFirme, firmaId: string, def: DefinicijaSifrarnika, trenutno: Record<string, unknown> = {}) {
  const rezultat: Record<string, { vrijednost: string; naziv: string }[]> = {};
  for (const p of def.polja) {
    if (p.vrsta !== "odabir") continue;
    if (p.opcije) {
      rezultat[p.ime] = [...p.opcije];
      continue;
    }
    if (!p.izvor) continue;
    const odabran = trenutno[p.ime];
    const zapisi = await delegat(db as never, p.izvor).findMany({
      where: { firmaId, OR: [{ aktivan: true }, ...(typeof odabran === "string" ? [{ id: odabran }] : [])] },
      select: { id: true, naziv: true, aktivan: true },
      orderBy: { naziv: "asc" },
    });
    rezultat[p.ime] = zapisi.map((z) => ({ vrijednost: z.id, naziv: z.aktivan ? z.naziv : `${z.naziv} (deaktiviran)` }));
  }
  return rezultat;
}

export async function brojeviSifrarnika(db: DbFirme, firmaId: string) {
  return Object.fromEntries(
    await Promise.all(
      SIFRARNICI.map(async (d) => [d.kljuc, await delegat(db as never, d.model).count({ where: { firmaId, aktivan: true } })] as const),
    ),
  ) as Record<string, number>;
}
