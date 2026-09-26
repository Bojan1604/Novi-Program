import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import { normalizirajSerijski } from "@/domain/stanja-uredaja";

/**
 * Čitanja za portal klijenata. SVAKI upit filtrira po firmaId I partnerId klijenta —
 * id iz URL-a nikad nije dovoljan (napad na tuđe uređaje vraća „ne postoji“).
 * Klijentu se ne šalju interni podaci: nabavna cijena, napomene, dijagnoza, lokacija.
 */
export const STANJA_ZA_KLIJENTA: Record<string, string> = {
  PRODAN: "Kod vas",
  U_NAJMU: "U najmu",
  NA_SERVISU: "Na servisu",
  ZAMJENSKI: "Zamjenski uređaj",
};

const polja = {
  id: true,
  serijski: true,
  stanje: true,
  jamstvoDo: true,
  model: { select: { naziv: true, proizvodjac: { select: { naziv: true } } } },
} satisfies Prisma.UredajSelect;

export async function uredajiKlijenta(
  db: PrismaClient,
  k: { firmaId: string; partnerId: string },
  p: { trazi?: string | undefined; stranica: number; velicina: number },
) {
  const where: Prisma.UredajWhereInput = {
    firmaId: k.firmaId,
    partnerId: k.partnerId,
    stanje: { in: ["PRODAN", "U_NAJMU", "NA_SERVISU", "ZAMJENSKI"] },
    ...(p.trazi ? { serijski: { contains: normalizirajSerijski(p.trazi) } } : {}),
  };
  const [ukupno, redovi] = await Promise.all([
    db.uredaj.count({ where }),
    db.uredaj.findMany({ where, orderBy: [{ serijski: "asc" }], skip: (p.stranica - 1) * p.velicina, take: p.velicina, select: polja }),
  ]);
  return { ukupno, redovi };
}

export async function uredajKlijenta(db: PrismaClient, k: { firmaId: string; partnerId: string }, id: string) {
  if (!jeUuid(id)) return null;
  const u = await db.uredaj.findFirst({
    where: { id, firmaId: k.firmaId, partnerId: k.partnerId, stanje: { in: ["PRODAN", "U_NAJMU", "NA_SERVISU", "ZAMJENSKI"] } },
    select: { ...polja, cpu: true, ram: true, disk: true, os: true },
  });
  if (!u) return null;
  const nalozi = await db.servisniNalog.findMany({
    where: { firmaId: k.firmaId, partnerId: k.partnerId, uredajId: id },
    orderBy: { datum: "desc" },
    select: { id: true, broj: true, datum: true, status: true },
  });
  return { ...u, nalozi };
}

// ——— servisni nalozi na portalu (korak 5.3): samo javni podaci ———

export async function naloziKlijenta(db: PrismaClient, k: { firmaId: string; partnerId: string }, p: { stranica: number; velicina: number }) {
  const where = { firmaId: k.firmaId, partnerId: k.partnerId };
  const [ukupno, redovi] = await Promise.all([
    db.servisniNalog.count({ where }),
    db.servisniNalog.findMany({
      where,
      orderBy: [{ datum: "desc" }, { redni: "desc" }],
      skip: (p.stranica - 1) * p.velicina,
      take: p.velicina,
      select: { id: true, broj: true, datum: true, status: true, opisKvara: true, uredaj: { select: { serijski: true } } },
    }),
  ]);
  return { ukupno, redovi };
}

/** Nalog klijenta: bez interne dijagnoze, internih događaja i internih priloga. */
export async function nalogKlijenta(db: PrismaClient, k: { firmaId: string; partnerId: string }, id: string) {
  if (!jeUuid(id)) return null;
  const n = await db.servisniNalog.findFirst({
    where: { id, firmaId: k.firmaId, partnerId: k.partnerId },
    select: {
      id: true,
      broj: true,
      datum: true,
      zatvoren: true,
      status: true,
      opisKvara: true,
      napomenaKlijentu: true,
      kontakt: true,
      zamjenaOd: true,
      zamjenaDo: true,
      uredaj: { select: { id: true, serijski: true, model: { select: { naziv: true, proizvodjac: { select: { naziv: true } } } } } },
      zamjenski: { select: { serijski: true } },
      dogadaji: { where: { javno: true }, orderBy: { vrijeme: "desc" }, select: { id: true, vrijeme: true, opis: true } },
    },
  });
  if (!n) return null;
  const prilozi = await db.prilog.findMany({
    where: { firmaId: k.firmaId, entitet: "ServisniNalog", entitetId: n.id, javno: true },
    orderBy: { stvoreno: "asc" },
    select: { id: true, naziv: true, vrsta: true, velicina: true },
  });
  return { ...n, prilozi };
}

/** Javni prilog naloga klijenta (preuzimanje); tuđi ili interni → null. */
export async function prilogKlijenta(db: PrismaClient, k: { firmaId: string; partnerId: string }, id: string) {
  if (!jeUuid(id)) return null;
  const p = await db.prilog.findFirst({ where: { id, firmaId: k.firmaId, entitet: "ServisniNalog", javno: true } });
  if (!p) return null;
  const n = await db.servisniNalog.count({ where: { id: p.entitetId, firmaId: k.firmaId, partnerId: k.partnerId } });
  return n ? p : null;
}

/** Uređaji za koje klijent može prijaviti kvar (kod njega ili u najmu, bez otvorenog naloga). */
export async function uredajiZaPrijavu(db: PrismaClient, k: { firmaId: string; partnerId: string }) {
  return db.uredaj.findMany({
    where: {
      firmaId: k.firmaId,
      partnerId: k.partnerId,
      stanje: { in: ["PRODAN", "U_NAJMU"] },
      servisniNalozi: { none: { status: { in: ["PRIJAVLJEN", "ZAPRIMLJEN", "DIJAGNOZA", "CEKA_DIJELOVE", "POPRAVAK", "GOTOV"] } } },
    },
    orderBy: { serijski: "asc" },
    take: 500,
    select: { id: true, serijski: true, model: { select: { naziv: true } } },
  });
}
