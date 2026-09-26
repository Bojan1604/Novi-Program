import type { Prisma } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import { REZULTATI } from "@/domain/inventura";
import type { DbFirme } from "@/lib/firma-db";

export async function popisInventura(db: DbFirme, firmaId: string, f: { status: string[]; stranica: number; velicina: number }) {
  const statusi = f.status.filter((s) => s === "OTVORENA" || s === "ZAKLJUCENA");
  const where: Prisma.InventuraWhereInput = statusi.length ? { firmaId, status: { in: statusi } } : { firmaId };
  const [ukupno, redovi] = await Promise.all([
    db.inventura.count({ where }),
    db.inventura.findMany({
      where,
      orderBy: [{ datum: "desc" }, { stvoreno: "desc" }],
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
      include: { skladiste: { select: { naziv: true } }, _count: { select: { stavke: true } } },
    }),
  ]);
  return { ukupno, redovi };
}

/** Inventura s brojačima (dok je otvorena — uživo) i stranicom stavki (može ih biti tisuće). */
export async function inventura(db: DbFirme, firmaId: string, id: string, f: { rezultat: string[]; stranica: number; velicina: number }) {
  if (!jeUuid(id)) return null;
  const inv = await db.inventura.findFirst({ where: { firmaId, id }, include: { skladiste: { select: { naziv: true } } } });
  if (!inv) return null;
  const rezultati = f.rezultat.filter((r) => Object.hasOwn(REZULTATI, r));
  const where: Prisma.StavkaInventureWhereInput = { firmaId, inventuraId: id, ...(rezultati.length ? { rezultat: { in: rezultati } } : {}) };
  const [ukupno, stavke, zivo] = await Promise.all([
    db.stavkaInventure.count({ where }),
    db.stavkaInventure.findMany({
      where,
      orderBy: [{ vrijeme: "desc" }, { serijski: "asc" }],
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
      select: {
        id: true,
        serijski: true,
        rezultat: true,
        stanje: true,
        skladiste: true,
        skenirano: true,
        uredaj: { select: { id: true, stanje: true, skladisteId: true, skladiste: { select: { naziv: true } }, model: { select: { naziv: true } } } },
      },
    }),
    inv.status === "OTVORENA"
      ? Promise.all([
          db.uredaj.count({ where: { firmaId, skladisteId: inv.skladisteId } }),
          db.stavkaInventure.count({ where: { firmaId, inventuraId: id } }),
          db.stavkaInventure.count({ where: { firmaId, inventuraId: id, uredaj: { skladisteId: inv.skladisteId } } }),
        ])
      : null,
  ]);
  return {
    ...inv,
    ukupno,
    stavke,
    zivo: zivo ? { ocekivano: zivo[0], skenirano: zivo[1], pronadjeno: zivo[2] } : null,
  };
}
