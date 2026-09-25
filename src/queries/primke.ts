import type { Prisma } from "@/generated/prisma/client";
import { centiIzDecimala } from "@/domain/novac";
import type { Sortiranje } from "@/domain/popis";
import type { DbFirme } from "@/lib/firma-db";

export type FilterPrimki = { trazi?: string; status: string[]; sort: Sortiranje<"datum" | "broj">; stranica: number; velicina: number };

export function uvjetPrimki(firmaId: string, f: Pick<FilterPrimki, "trazi" | "status">): Prisma.PrimkaWhereInput {
  const w: Prisma.PrimkaWhereInput = { firmaId };
  const i: Prisma.PrimkaWhereInput[] = [];
  if (f.trazi) {
    const t = f.trazi.trim();
    i.push({
      OR: [
        { broj: { contains: t, mode: "insensitive" } },
        { dokumentDobavljaca: { contains: t, mode: "insensitive" } },
        { dobavljac: { naziv: { contains: t, mode: "insensitive" } } },
        { uredaji: { some: { serijski: t.toUpperCase() } } },
      ],
    });
  }
  if (f.status.length) i.push({ status: { in: f.status } });
  if (i.length) w.AND = i;
  return w;
}

export async function popisPrimki(db: DbFirme, firmaId: string, f: FilterPrimki, vidiNabavne: boolean) {
  const where = uvjetPrimki(firmaId, f);
  const orderBy: Prisma.PrimkaOrderByWithRelationInput[] =
    f.sort.kljuc === "broj" ? [{ godina: f.sort.smjer }, { redni: f.sort.smjer }] : [{ datum: f.sort.smjer }, { redni: f.sort.smjer }];
  const [ukupno, redovi, zbroj] = await Promise.all([
    db.primka.count({ where }),
    db.primka.findMany({
      where,
      orderBy,
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
      select: {
        id: true,
        broj: true,
        datum: true,
        status: true,
        brojUredaja: true,
        nabavnaVrijednost: true,
        dokumentDobavljaca: true,
        dobavljac: { select: { naziv: true } },
        skladiste: { select: { naziv: true } },
      },
    }),
    db.primka.aggregate({ where: { AND: [where, { status: "IZDANA" }] }, _sum: { brojUredaja: true, nabavnaVrijednost: true } }),
  ]);
  return {
    ukupno,
    zbrojUredaja: zbroj._sum.brojUredaja ?? 0,
    // nabavne vrijednosti samo s pravom — inače se uopće ne vraćaju
    zbrojNabavno: vidiNabavne && zbroj._sum.nabavnaVrijednost ? centiIzDecimala(zbroj._sum.nabavnaVrijednost.toString()) : null,
    redovi: redovi.map((r) => ({
      ...r,
      nabavnaVrijednost: vidiNabavne && r.nabavnaVrijednost ? centiIzDecimala(r.nabavnaVrijednost.toString()) : null,
    })),
  };
}

export async function primka(db: DbFirme, firmaId: string, id: string, vidiNabavne: boolean) {
  const p = await db.primka.findFirst({
    where: { id, firmaId },
    include: {
      dobavljac: { select: { id: true, naziv: true } },
      skladiste: { select: { naziv: true } },
      uredaji: {
        orderBy: { serijski: "asc" },
        select: {
          id: true,
          serijski: true,
          stanje: true,
          nabavnaCijena: true,
          cpu: true,
          ram: true,
          os: true,
          model: { select: { naziv: true, proizvodjac: { select: { naziv: true } } } },
        },
      },
    },
  });
  if (!p) return null;
  return {
    ...p,
    nabavnaVrijednost: vidiNabavne && p.nabavnaVrijednost ? centiIzDecimala(p.nabavnaVrijednost.toString()) : null,
    uredaji: p.uredaji.map((u) => ({ ...u, nabavnaCijena: vidiNabavne && u.nabavnaCijena ? centiIzDecimala(u.nabavnaCijena.toString()) : null })),
  };
}

export async function opcijeZaprimanja(db: DbFirme, firmaId: string) {
  const [skladista, stanja] = await Promise.all([
    db.skladiste.findMany({
      where: { firmaId, aktivan: true },
      orderBy: [{ zadano: "desc" }, { naziv: "asc" }],
      select: { id: true, naziv: true, zadano: true },
    }),
    db.stanjeRobe.findMany({ where: { firmaId, aktivan: true }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true } }),
  ]);
  return { skladista, stanja };
}
