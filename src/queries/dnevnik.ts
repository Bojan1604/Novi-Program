import type { Prisma } from "@/generated/prisma/client";
import { dodajDane, jeDatum, pocetakDana } from "@/domain/datum";
import { maskiraj, NAZIVI_ENTITETA, procitajPromjene } from "@/domain/dnevnik";
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

export function uvjetDnevnika(firmaId: string, f: FilterDnevnika): Prisma.DnevnikWhereInput {
  const w: Prisma.DnevnikWhereInput = { firmaId };
  if (f.korisnikId) w.korisnikId = f.korisnikId;
  if (f.entitet) w.entitet = f.entitet;
  if (f.entitetId) w.entitetId = f.entitetId;
  if (f.od || f.do) {
    w.vrijeme = {};
    if (jeDatum(f.od)) w.vrijeme.gte = pocetakDana(f.od);
    if (jeDatum(f.do) && f.do < "2999-12-31") w.vrijeme.lt = pocetakDana(dodajDane(f.do, 1));
  }
  const t = f.trazi?.trim().toLowerCase();
  if (t)
    w.AND = t
      .split(/\s+/)
      .slice(0, 5)
      .map((rijec) => ({ pretraga: { contains: rijec } }));
  return w;
}

/**
 * Stranica dnevnika. Osjetljive vrijednosti (nabavne cijene) maskirane su OVDJE,
 * na poslužitelju, ako korisnik nema pravo — preglednik ih nikad ne dobije.
 */
export async function stranicaDnevnika(db: DbFirme, firmaId: string, f: FilterDnevnika, vidiNabavne: boolean) {
  const velicina = Math.min(Math.max(f.velicina ?? 50, 10), 200);
  const stranica = Math.max(1, Math.floor(f.stranica) || 1);
  const where = uvjetDnevnika(firmaId, f);
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

/** Opcije filtara bez čitanja cijelog dnevnika: korisnici iz članstava, vrste iz stalnog popisa. */
export async function filtriDnevnika(db: DbFirme, firmaId: string) {
  const clanovi = await db.clanstvoFirme.findMany({ where: { firmaId }, select: { korisnikId: true, korisnik: { select: { ime: true } } } });
  return {
    korisnici: clanovi.map((c) => ({ id: c.korisnikId, ime: c.korisnik.ime })).sort((a, b) => a.ime.localeCompare(b.ime, "hr")),
    entiteti: Object.entries(NAZIVI_ENTITETA)
      .map(([vrijednost, naziv]) => ({ vrijednost, naziv }))
      .sort((a, b) => a.naziv.localeCompare(b.naziv, "hr")),
  };
}

/** Svi zapisi prema filtru (za izvoz), najviše `najvise`; osjetljive vrijednosti maskirane kao i na ekranu. */
export async function dnevnikZaIzvoz(db: DbFirme, firmaId: string, f: Omit<FilterDnevnika, "stranica">, vidiNabavne: boolean, najvise: number) {
  const zapisi = await db.dnevnik.findMany({
    where: uvjetDnevnika(firmaId, { ...f, stranica: 1 }),
    orderBy: [{ vrijeme: "desc" }, { id: "desc" }],
    take: najvise,
    select: { vrijeme: true, korisnik: true, radnja: true, entitet: true, entitetId: true, opis: true, promjene: true },
  });
  return zapisi.map((z) => ({ ...z, promjene: maskiraj(procitajPromjene(z.promjene), vidiNabavne) }));
}
