import type { Prisma } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import type { Sortiranje } from "@/domain/popis";
import { POPIS_VRSTA, STATUSI_DOKUMENTA } from "@/domain/skladisni-dokumenti";
import type { DbFirme } from "@/lib/firma-db";

export type FilterDokumenata = {
  trazi?: string;
  vrsta: string[];
  status: string[];
  sort: Sortiranje<"datum" | "broj">;
  stranica: number;
  velicina: number;
};

export function uvjetDokumenata(firmaId: string, f: Pick<FilterDokumenata, "trazi" | "vrsta" | "status">): Prisma.SkladisniDokumentWhereInput {
  const i: Prisma.SkladisniDokumentWhereInput[] = [];
  const t = f.trazi?.trim();
  if (t) {
    i.push({
      OR: [
        { broj: { contains: t, mode: "insensitive" } },
        { razlog: { contains: t, mode: "insensitive" } },
        { napomena: { contains: t, mode: "insensitive" } },
        { partner: { naziv: { contains: t, mode: "insensitive" } } },
        { stavke: { some: { uredaj: { serijski: t.toUpperCase().replace(/\s+/g, "") } } } },
      ],
    });
  }
  const vrste = f.vrsta.filter((v) => (POPIS_VRSTA as string[]).includes(v));
  if (vrste.length) i.push({ vrsta: { in: vrste } });
  const statusi = f.status.filter((s) => Object.hasOwn(STATUSI_DOKUMENTA, s));
  if (statusi.length) i.push({ status: { in: statusi } });
  return i.length ? { firmaId, AND: i } : { firmaId };
}

export async function popisDokumenata(db: DbFirme, firmaId: string, f: FilterDokumenata) {
  const where = uvjetDokumenata(firmaId, f);
  const orderBy: Prisma.SkladisniDokumentOrderByWithRelationInput[] =
    f.sort.kljuc === "broj"
      ? [{ vrsta: "asc" }, { godina: f.sort.smjer }, { redni: f.sort.smjer }]
      : [{ datum: f.sort.smjer }, { stvoreno: f.sort.smjer }];
  const [ukupno, redovi, zbroj] = await Promise.all([
    db.skladisniDokument.count({ where }),
    db.skladisniDokument.findMany({
      where,
      orderBy,
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
      select: {
        id: true,
        vrsta: true,
        broj: true,
        datum: true,
        status: true,
        razlog: true,
        brojUredaja: true,
        korisnik: true,
        skladisteIz: { select: { naziv: true } },
        skladisteU: { select: { naziv: true } },
        partner: { select: { naziv: true } },
      },
    }),
    db.skladisniDokument.aggregate({ where: { AND: [where, { status: "IZDAN" }] }, _sum: { brojUredaja: true } }),
  ]);
  return { ukupno, redovi, zbrojUredaja: zbroj._sum.brojUredaja ?? 0 };
}

export async function skladisniDokument(
  db: DbFirme,
  firmaId: string,
  id: string,
  str: { stranica: number; velicina: number } = { stranica: 1, velicina: 100 },
) {
  if (!jeUuid(id)) return null;
  const d = await db.skladisniDokument.findFirst({
    where: { firmaId, id },
    include: {
      skladisteIz: { select: { naziv: true } },
      skladisteU: { select: { naziv: true } },
      partner: { select: { id: true, naziv: true } },
      stavke: {
        orderBy: { uredaj: { serijski: "asc" } },
        skip: (str.stranica - 1) * str.velicina,
        take: str.velicina,
        select: {
          staroStanje: true,
          uredaj: {
            select: { id: true, serijski: true, stanje: true, model: { select: { naziv: true, proizvodjac: { select: { naziv: true } } } } },
          },
        },
      },
    },
  });
  if (!d) return null;
  const odobrenje = await db.odobrenje.findFirst({ where: { firmaId, entitet: "SkladisniDokument", entitetId: id }, orderBy: { stvoreno: "desc" } });
  return { ...d, odobrenje };
}

export async function skladistaZaDokument(db: DbFirme, firmaId: string) {
  return db.skladiste.findMany({
    where: { firmaId },
    orderBy: [{ aktivan: "desc" }, { zadano: "desc" }, { naziv: "asc" }],
    select: { id: true, naziv: true, aktivan: true, zadano: true },
  });
}

export type FilterOdobrenja = { status: string[]; stranica: number; velicina: number };

export async function popisOdobrenja(db: DbFirme, firmaId: string, f: FilterOdobrenja) {
  const statusi = f.status.filter((s) => ["CEKA", "ODOBRENO", "ODBIJENO"].includes(s));
  const where: Prisma.OdobrenjeWhereInput = statusi.length ? { firmaId, status: { in: statusi } } : { firmaId };
  const [ukupno, redovi, ceka] = await Promise.all([
    db.odobrenje.count({ where }),
    db.odobrenje.findMany({ where, orderBy: [{ stvoreno: "desc" }, { id: "desc" }], skip: (f.stranica - 1) * f.velicina, take: f.velicina }),
    db.odobrenje.count({ where: { firmaId, status: "CEKA" } }),
  ]);
  return { ukupno, redovi, ceka };
}
