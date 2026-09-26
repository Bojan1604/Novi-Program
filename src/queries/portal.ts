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
