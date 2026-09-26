import type { Prisma } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala } from "@/domain/novac";
import type { Sortiranje } from "@/domain/popis";
import { jeVrstaProdaje } from "@/domain/prodaja";
import type { DbFirme } from "@/lib/firma-db";

export type FilterProdaje = {
  vrsta: string[];
  trazi?: string;
  status: string[];
  partnerId?: string;
  /** OTVORENI (duguje), ZA_POVRAT (preplaćeni), PLACENI */
  placanje?: string;
  sort: Sortiranje<"datum" | "broj" | "ukupno">;
  stranica: number;
  velicina: number;
};

export function uvjetProdaje(
  firmaId: string,
  f: Omit<FilterProdaje, "sort" | "stranica" | "velicina">,
  zadaneVrste: string[],
): Prisma.ProdajniDokumentWhereInput {
  const vrste = f.vrsta.filter((v) => jeVrstaProdaje(v) && zadaneVrste.includes(v));
  const i: Prisma.ProdajniDokumentWhereInput[] = [{ vrsta: { in: vrste.length ? vrste : zadaneVrste } }];
  const t = f.trazi?.trim();
  if (t) {
    i.push({
      OR: [
        { broj: { contains: t, mode: "insensitive" } },
        { partner: { naziv: { contains: t, mode: "insensitive" } } },
        { napomena: { contains: t, mode: "insensitive" } },
        { stavke: { some: { uredaj: { serijski: t.toUpperCase().replace(/\s+/g, "") } } } },
      ],
    });
  }
  const statusi = f.status.filter((s) => ["NACRT", "IZDAN", "STORNIRAN"].includes(s));
  if (statusi.length) i.push({ status: { in: statusi } });
  if (f.partnerId && jeUuid(f.partnerId)) i.push({ partnerId: f.partnerId });
  return { firmaId, AND: i };
}

export async function popisProdaje(db: DbFirme, firmaId: string, f: FilterProdaje, zadaneVrste: string[]) {
  const osnova = uvjetProdaje(firmaId, f, zadaneVrste);
  const placeno = db.prodajniDokument.fields.placeno;
  const where: Prisma.ProdajniDokumentWhereInput =
    f.placanje === "OTVORENI"
      ? { AND: [osnova, { status: "IZDAN", ukupno: { gt: placeno } }] }
      : f.placanje === "ZA_POVRAT"
        ? {
            AND: [
              osnova,
              { vrsta: { not: "STORNO" } },
              {
                OR: [
                  { status: "IZDAN", ukupno: { lt: placeno } },
                  { status: "STORNIRAN", placeno: { gt: 0 } },
                ],
              },
            ],
          }
        : f.placanje === "PLACENI"
          ? { AND: [osnova, { status: "IZDAN", ukupno: { equals: placeno } }] }
          : osnova;
  const s = f.sort.smjer;
  const orderBy: Prisma.ProdajniDokumentOrderByWithRelationInput[] =
    f.sort.kljuc === "broj"
      ? [{ godina: { sort: s, nulls: "first" } }, { redni: { sort: s, nulls: "first" } }, { stvoreno: s }]
      : f.sort.kljuc === "ukupno"
        ? [{ ukupno: s }, { id: s }]
        : [{ datum: s }, { stvoreno: s }];
  const [ukupno, redovi, zbroj, otvoreno] = await Promise.all([
    db.prodajniDokument.count({ where }),
    db.prodajniDokument.findMany({
      where,
      orderBy,
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
      select: {
        id: true,
        vrsta: true,
        status: true,
        broj: true,
        datum: true,
        vrijediDo: true,
        dospijece: true,
        osnovica: true,
        ukupno: true,
        placeno: true,
        korisnik: true,
        partner: { select: { id: true, naziv: true } },
      },
    }),
    // promet: izdani i stornirani s njihovim stornima (poništavaju se), bez nacrta
    db.prodajniDokument.aggregate({ where: { AND: [where, { status: { in: ["IZDAN", "STORNIRAN"] } }] }, _sum: { osnovica: true, ukupno: true } }),
    // otvoreno: samo važeći računi i odobrenja
    db.prodajniDokument.aggregate({ where: { AND: [where, { status: "IZDAN", vrsta: { not: "STORNO" } }] }, _sum: { ukupno: true, placeno: true } }),
  ]);
  return {
    ukupno,
    zbrojOsnovica: centiIzDecimala((zbroj._sum.osnovica ?? 0).toString()),
    zbrojUkupno: centiIzDecimala((zbroj._sum.ukupno ?? 0).toString()),
    zbrojOtvoreno: centiIzDecimala((otvoreno._sum.ukupno ?? 0).toString()) - centiIzDecimala((otvoreno._sum.placeno ?? 0).toString()),
    redovi: redovi.map((r) => ({
      ...r,
      osnovica: centiIzDecimala(r.osnovica.toFixed(2)),
      ukupno: centiIzDecimala(r.ukupno.toFixed(2)),
      placeno: centiIzDecimala(r.placeno.toFixed(2)),
    })),
  };
}

export async function prodajniDokument(db: DbFirme, firmaId: string, id: string) {
  if (!jeUuid(id)) return null;
  const d = await db.prodajniDokument.findFirst({
    where: { firmaId, id },
    include: {
      partner: { select: { id: true, naziv: true, drzava: true, pdvBroj: true, pdvStatus: true, oib: true } },
      poslovnica: { select: { id: true, naziv: true } },
      stavke: { orderBy: { redoslijed: "asc" }, include: { uredaj: { select: { serijski: true, stanje: true } } } },
      uplate: { orderBy: [{ datum: "asc" }, { stvoreno: "asc" }] },
    },
  });
  if (!d) return null;
  const [izvor, izvedeni, poslovnice] = await Promise.all([
    d.izvorId ? db.prodajniDokument.findFirst({ where: { firmaId, id: d.izvorId }, select: { id: true, vrsta: true, broj: true } }) : null,
    db.prodajniDokument.findMany({ where: { firmaId, izvorId: id }, select: { id: true, vrsta: true, broj: true, status: true } }),
    d.partnerId
      ? db.poslovnica.findMany({
          where: { firmaId, partnerId: d.partnerId, aktivan: true },
          orderBy: { naziv: "asc" },
          select: { id: true, naziv: true },
        })
      : [],
  ]);
  return { ...d, izvor, izvedeni, poslovnice };
}
