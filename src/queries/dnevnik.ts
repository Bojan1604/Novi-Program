import type { Prisma } from "@/generated/prisma/client";
import { dodajDane, jeDatum, pocetakDana } from "@/domain/datum";
import { maskiraj, procitajPromjene } from "@/domain/dnevnik";
import type { DbFirme } from "@/lib/firma-db";

export type FilterDnevnika = {
  stranica: number;
  velicina?: number;
  korisnikId?: string;
  entitet?: string;
  entitetId?: string;
  /** YYYY-MM-DD (uključivo, po Zagrebu) */
  od?: string;
  do?: string;
  trazi?: string;
};

function uvjet(firmaId: string, f: FilterDnevnika): Prisma.DnevnikWhereInput {
  const w: Prisma.DnevnikWhereInput = { firmaId };
  if (f.korisnikId) w.korisnikId = f.korisnikId;
  if (f.entitet) w.entitet = f.entitet;
  if (f.entitetId) w.entitetId = f.entitetId;
  if (f.od || f.do) {
    w.vrijeme = {};
    if (jeDatum(f.od)) w.vrijeme.gte = pocetakDana(f.od);
    if (jeDatum(f.do)) w.vrijeme.lt = pocetakDana(dodajDane(f.do, 1));
  }
  const t = f.trazi?.trim().toLowerCase();
  if (t) w.AND = t.split(/\s+/).slice(0, 5).map((rijec) => ({ pretraga: { contains: rijec } }));
  return w;
}

/**
 * Stranica dnevnika. Osjetljive vrijednosti (nabavne cijene) maskirane su OVDJE,
 * na poslužitelju, ako korisnik nema pravo — preglednik ih nikad ne dobije.
 */
export async function stranicaDnevnika(db: DbFirme, firmaId: string, f: FilterDnevnika, vidiNabavne: boolean) {
  const velicina = Math.min(Math.max(f.velicina ?? 50, 10), 200);
  const stranica = Math.max(1, Math.floor(f.stranica) || 1);
  const where = uvjet(firmaId, f);
  const [ukupno, zapisi] = await Promise.all([
    db.dnevnik.count({ where }),
    db.dnevnik.findMany({
      where,
      orderBy: [{ vrijeme: "desc" }, { id: "desc" }],
      skip: (stranica - 1) * velicina,
      take: velicina,
      select: { id: true, vrijeme: true, korisnik: true, korisnikId: true, radnja: true, entitet: true, entitetId: true, opis: true, promjene: true },
    }),
  ]);
  return {
    ukupno,
    stranica,
    velicina,
    zapisi: zapisi.map((z) => ({ ...z, promjene: maskiraj(procitajPromjene(z.promjene), vidiNabavne) })),
  };
}

export async function filtriDnevnika(db: DbFirme, firmaId: string) {
  const [korisnici, entiteti] = await Promise.all([
    db.dnevnik.findMany({ where: { firmaId, korisnikId: { not: null } }, distinct: ["korisnikId"], select: { korisnikId: true, korisnik: true } }),
    db.dnevnik.findMany({ where: { firmaId }, distinct: ["entitet"], select: { entitet: true } }),
  ]);
  return {
    korisnici: korisnici.map((k) => ({ id: k.korisnikId!, ime: k.korisnik })).sort((a, b) => a.ime.localeCompare(b.ime, "hr")),
    entiteti: entiteti.map((e) => e.entitet).sort(),
  };
}
