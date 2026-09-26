import type { Prisma } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import type { DbFirme } from "@/lib/firma-db";

export type FilterUgovora = { trazi?: string; status: string[]; partnerId?: string; stranica: number; velicina: number };

const d = (x: string) => new Date(`${x}T00:00:00Z`);

/** Uvjet statusa na dan (isto pravilo kao statusUgovora u domain/ugovor-najma.ts). */
function uvjetStatusa(s: string, danas: string): Prisma.UgovorNajmaWhereInput | null {
  const dan = d(danas);
  switch (s) {
    case "OTKAZAN":
      return { otkazan: { lt: dan } };
    case "ISTEKAO":
      return { OR: [{ otkazan: null }, { otkazan: { gte: dan } }], do: { lt: dan } };
    case "NA_CEKANJU":
      return { OR: [{ otkazan: null }, { otkazan: { gte: dan } }], AND: [{ OR: [{ do: null }, { do: { gte: dan } }] }], od: { gt: dan } };
    case "AKTIVAN":
      return { OR: [{ otkazan: null }, { otkazan: { gte: dan } }], AND: [{ OR: [{ do: null }, { do: { gte: dan } }] }], od: { lte: dan } };
    default:
      return null;
  }
}

export function uvjetUgovora(firmaId: string, f: Omit<FilterUgovora, "stranica" | "velicina">, danas: string): Prisma.UgovorNajmaWhereInput {
  const i: Prisma.UgovorNajmaWhereInput[] = [];
  const t = f.trazi?.trim();
  if (t)
    i.push({
      OR: [
        { broj: { contains: t, mode: "insensitive" } },
        { partner: { naziv: { contains: t, mode: "insensitive" } } },
        { uvjeti: { contains: t, mode: "insensitive" } },
      ],
    });
  const statusi = f.status.map((s) => uvjetStatusa(s, danas)).filter((x): x is Prisma.UgovorNajmaWhereInput => !!x);
  if (statusi.length) i.push({ OR: statusi });
  if (f.partnerId && jeUuid(f.partnerId)) i.push({ partnerId: f.partnerId });
  return { firmaId, AND: i };
}

export async function popisUgovora(db: DbFirme, firmaId: string, f: FilterUgovora, danas: string) {
  const where = uvjetUgovora(firmaId, f, danas);
  const [ukupno, redovi] = await Promise.all([
    db.ugovorNajma.count({ where }),
    db.ugovorNajma.findMany({
      where,
      orderBy: [{ od: "desc" }, { stvoreno: "desc" }],
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
      select: {
        id: true,
        broj: true,
        od: true,
        do: true,
        otkazan: true,
        partner: { select: { id: true, naziv: true } },
        poslovnica: { select: { naziv: true } },
      },
    }),
  ]);
  return { ukupno, redovi };
}

export async function ugovorNajma(db: DbFirme, firmaId: string, id: string) {
  if (!jeUuid(id)) return null;
  const u = await db.ugovorNajma.findFirst({
    where: { firmaId, id },
    include: { partner: { select: { id: true, naziv: true, oib: true } }, poslovnica: { select: { id: true, naziv: true } } },
  });
  if (!u) return null;
  const [prilozi, poslovnice] = await Promise.all([
    db.prilog.findMany({
      where: { firmaId, entitet: "UgovorNajma", entitetId: id },
      orderBy: { stvoreno: "desc" },
      select: { id: true, naziv: true, velicina: true, korisnik: true, stvoreno: true },
    }),
    db.poslovnica.findMany({
      where: { firmaId, partnerId: u.partnerId, aktivan: true },
      orderBy: { naziv: "asc" },
      select: { id: true, naziv: true },
    }),
  ]);
  return { ...u, prilozi, poslovnice };
}
