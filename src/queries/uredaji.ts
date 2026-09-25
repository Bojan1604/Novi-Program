import type { Prisma } from "@/generated/prisma/client";
import { dodajDane, jeDatum } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala } from "@/domain/novac";
import type { Sortiranje } from "@/domain/popis";
import { POPIS_STANJA, type Stanje } from "@/domain/stanja-uredaja";
import type { SortiranjeUredaja } from "@/domain/stupci-uredaja";
import type { DbFirme } from "@/lib/firma-db";

export type FilterUredaja = {
  trazi?: string;
  stanje: string[];
  skladiste: string[];
  kategorija: string[];
  proizvodjac: string[];
  partnerId?: string;
  primkaId?: string;
  /** zaprimljeni od–do (YYYY-MM-DD) */
  od?: string;
  do?: string;
  /** jamstvo istječe do (YYYY-MM-DD) */
  jamstvoDo?: string;
  sort: Sortiranje<SortiranjeUredaja>;
  stranica: number;
  velicina: number;
};

const d = (x: string) => new Date(`${x}T00:00:00Z`);

/**
 * Uvjet popisa. `modeliPoNazivu` = id-evi modela čiji naziv odgovara pretrazi (vidi `modeliZaPretragu`) —
 * izravni uvjet na modelId je brži od spajanja tablica na 300.000 uređaja.
 */
export function uvjetUredaja(
  firmaId: string,
  f: Omit<FilterUredaja, "sort" | "stranica" | "velicina">,
  modeliPoNazivu: string[] = [],
): Prisma.UredajWhereInput {
  const i: Prisma.UredajWhereInput[] = [];
  const t = f.trazi?.trim();
  if (t) {
    const veliko = t.toUpperCase().replace(/\s+/g, "");
    // serijski je spremljen velikim slovima → LIKE koristi trigramski indeks
    i.push({ OR: [{ serijski: { contains: veliko } }, ...(modeliPoNazivu.length ? [{ modelId: { in: modeliPoNazivu } }] : [])] });
  }
  const stanja = f.stanje.filter((s): s is Stanje => (POPIS_STANJA as string[]).includes(s));
  if (stanja.length) i.push({ stanje: { in: stanja } });
  const uuid = (l: string[]) => l.filter(jeUuid);
  if (uuid(f.skladiste).length) i.push({ skladisteId: { in: uuid(f.skladiste) } });
  if (uuid(f.kategorija).length) i.push({ model: { kategorijaId: { in: uuid(f.kategorija) } } });
  if (uuid(f.proizvodjac).length) i.push({ model: { proizvodjacId: { in: uuid(f.proizvodjac) } } });
  if (f.partnerId && jeUuid(f.partnerId)) i.push({ partnerId: f.partnerId });
  if (f.primkaId && jeUuid(f.primkaId)) i.push({ primkaId: f.primkaId });
  if (jeDatum(f.od)) i.push({ nabavniDatum: { gte: d(f.od) } });
  if (jeDatum(f.do) && f.do < "2999-12-31") i.push({ nabavniDatum: { lt: d(dodajDane(f.do, 1)) } });
  if (jeDatum(f.jamstvoDo)) i.push({ jamstvoDo: { lte: d(f.jamstvoDo) } });
  return i.length ? { firmaId, AND: i } : { firmaId };
}

/** Modeli čiji naziv (ili proizvođač) sadrži tekst pretrage — mala tablica, jedan brzi upit. */
export async function modeliZaPretragu(db: DbFirme, firmaId: string, trazi: string | undefined): Promise<string[]> {
  const t = trazi?.trim();
  if (!t) return [];
  const m = await db.modelUredaja.findMany({
    where: { firmaId, OR: [{ naziv: { contains: t, mode: "insensitive" } }, { proizvodjac: { naziv: { contains: t, mode: "insensitive" } } }] },
    select: { id: true },
    take: 500,
  });
  return m.map((x) => x.id);
}

export async function popisUredaja(db: DbFirme, firmaId: string, f: FilterUredaja, vidiNabavne: boolean) {
  const where = uvjetUredaja(firmaId, f, await modeliZaPretragu(db, firmaId, f.trazi));
  const sort = f.sort.kljuc === "nabavnaCijena" && !vidiNabavne ? { kljuc: "stvoreno" as const, smjer: "desc" as const } : f.sort;
  const orderBy: Prisma.UredajOrderByWithRelationInput[] = [
    sort.kljuc === "nabavnaCijena" || sort.kljuc === "nabavniDatum" || sort.kljuc === "jamstvoDo"
      ? { [sort.kljuc]: { sort: sort.smjer, nulls: "last" } }
      : { [sort.kljuc]: sort.smjer },
    { id: sort.smjer },
  ];
  const [ukupno, redovi, poStanju, zbroj] = await Promise.all([
    db.uredaj.count({ where }),
    db.uredaj.findMany({
      where,
      orderBy,
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
      select: {
        id: true,
        serijski: true,
        stanje: true,
        nabavnaCijena: true,
        nabavniDatum: true,
        jamstvoDo: true,
        cpu: true,
        ram: true,
        disk: true,
        ekran: true,
        os: true,
        napomena: true,
        model: { select: { naziv: true, proizvodjac: { select: { naziv: true } }, kategorija: { select: { naziv: true } } } },
        skladiste: { select: { naziv: true } },
        partner: { select: { id: true, naziv: true } },
        stanjeRobe: { select: { naziv: true } },
        primka: { select: { id: true, broj: true } },
      },
    }),
    db.uredaj.groupBy({ by: ["stanje"], where, _count: true }),
    vidiNabavne ? db.uredaj.aggregate({ where, _sum: { nabavnaCijena: true } }) : Promise.resolve(null),
  ]);
  return {
    ukupno,
    poStanju: Object.fromEntries(poStanju.map((g) => [g.stanje, g._count])) as Partial<Record<Stanje, number>>,
    // nabavne vrijednosti samo s pravom — inače se uopće ne čitaju iz baze za prikaz
    zbrojNabavno: zbroj?._sum.nabavnaCijena ? centiIzDecimala(zbroj._sum.nabavnaCijena.toString()) : null,
    redovi: redovi.map((u) => ({ ...u, nabavnaCijena: vidiNabavne && u.nabavnaCijena ? centiIzDecimala(u.nabavnaCijena.toString()) : null })),
  };
}

export async function opcijeFiltaraUredaja(db: DbFirme, firmaId: string) {
  const [skladista, kategorije, proizvodjaci] = await Promise.all([
    db.skladiste.findMany({ where: { firmaId }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true } }),
    db.kategorija.findMany({ where: { firmaId }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true } }),
    db.proizvodjac.findMany({ where: { firmaId }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true } }),
  ]);
  const o = (l: { id: string; naziv: string }[]) => l.map((x) => ({ vrijednost: x.id, naziv: x.naziv }));
  return { skladista: o(skladista), kategorije: o(kategorije), proizvodjaci: o(proizvodjaci) };
}
