import type { PrismaClient } from "@/generated/prisma/client";
import { statusNarudzbe } from "@/domain/nabava";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

/**
 * Provjera dosljednosti (korak 4.7): skupni SQL upiti (brzo i za tisuće narudžbenica).
 * Svaki nalaz ima vrstu, opis i — gdje je sigurno — automatski popravak (zapisuje se u dnevnik).
 */
export type Nalaz = { vrsta: VrstaNalaza; id: string; opis: string; popravljivo: boolean; vrijednost?: number | string | null };

export const VRSTE_NALAZA = {
  ZAPRIMLJENO: "Zaprimljena količina na narudžbenici ≠ uređaji na primkama",
  STATUS_NARUDZBE: "Status narudžbenice ne odgovara količinama",
  VRIJEDNOST_PRIMKE: "Nabavna vrijednost primke ≠ zbroj nabavnih cijena uređaja",
  BROJ_NA_PRIMCI: "Broj uređaja na primci ≠ uređaji",
  PLACENO_RACUNA: "Plaćeno na računu ≠ zbroj uplata",
  STANJE_SKLADISTE: "Uređaj na skladištu bez skladišta (ili s kupcem)",
  STANJE_KUPAC: "Prodan ili u najmu bez kupca",
  NAJAM_BEZ_UGOVORA: "U najmu bez aktivnog ugovora",
} as const;
export type VrstaNalaza = keyof typeof VRSTE_NALAZA;

export async function provjeriDosljednost(db: PrismaClient, firmaId: string): Promise<Nalaz[]> {
  const [zaprimljeno, primkeV, primkeB, placeno, skladiste, kupac, najam, narudzbe] = await Promise.all([
    db.$queryRaw<{ id: string; broj: string; zapisano: number; stvarno: bigint }[]>`
      SELECT s.id::text, n.broj, s.zaprimljeno AS zapisano, COALESCE(c.broj, 0) AS stvarno
      FROM "StavkaNarudzbenice" s
      JOIN "Narudzbenica" n ON n.id = s."narudzbenicaId" AND n."firmaId" = s."firmaId"
      LEFT JOIN (
        SELECT u."stavkaNarudzbeniceId" AS sid, COUNT(*) AS broj
        FROM "Uredaj" u JOIN "Primka" p ON p.id = u."primkaId" AND p."firmaId" = u."firmaId"
        WHERE u."firmaId" = ${firmaId}::uuid AND u."stavkaNarudzbeniceId" IS NOT NULL AND p.status = 'IZDANA'
        GROUP BY u."stavkaNarudzbeniceId"
      ) c ON c.sid = s.id
      WHERE s."firmaId" = ${firmaId}::uuid AND s.zaprimljeno <> COALESCE(c.broj, 0)`,
    db.$queryRaw<{ id: string; broj: string; zapisano: string | null; stvarno: string | null }[]>`
      SELECT p.id::text, p.broj, p."nabavnaVrijednost"::text AS zapisano, SUM(u."nabavnaCijena")::text AS stvarno
      FROM "Primka" p JOIN "Uredaj" u ON u."primkaId" = p.id AND u."firmaId" = p."firmaId"
      WHERE p."firmaId" = ${firmaId}::uuid AND p.status = 'IZDANA'
      GROUP BY p.id
      HAVING COALESCE(p."nabavnaVrijednost", 0) <> COALESCE(SUM(u."nabavnaCijena"), 0) AND COUNT(u."nabavnaCijena") > 0`,
    db.$queryRaw<{ id: string; broj: string; zapisano: number; stvarno: bigint }[]>`
      SELECT p.id::text, p.broj, p."brojUredaja" AS zapisano, COUNT(u.id) AS stvarno
      FROM "Primka" p LEFT JOIN "Uredaj" u ON u."primkaId" = p.id AND u."firmaId" = p."firmaId"
      WHERE p."firmaId" = ${firmaId}::uuid AND p.status = 'IZDANA'
      GROUP BY p.id HAVING p."brojUredaja" <> COUNT(u.id)`,
    db.$queryRaw<{ id: string; broj: string | null; zapisano: string; stvarno: string }[]>`
      SELECT d.id::text, d.broj, d.placeno::text AS zapisano, COALESCE(SUM(up.iznos) FILTER (WHERE NOT up.ponistena), 0)::text AS stvarno
      FROM "ProdajniDokument" d LEFT JOIN "Uplata" up ON up."dokumentId" = d.id AND up."firmaId" = d."firmaId"
      WHERE d."firmaId" = ${firmaId}::uuid
      GROUP BY d.id HAVING d.placeno <> COALESCE(SUM(up.iznos) FILTER (WHERE NOT up.ponistena), 0)`,
    db.uredaj.findMany({
      where: { firmaId, stanje: { in: ["NA_SKLADISTU", "REZERVIRAN"] }, OR: [{ skladisteId: null }, { partnerId: { not: null } }] },
      select: { id: true, serijski: true },
      take: 1000,
    }),
    db.uredaj.findMany({
      where: { firmaId, stanje: { in: ["PRODAN", "U_NAJMU"] }, partnerId: null },
      select: { id: true, serijski: true },
      take: 1000,
    }),
    db.$queryRaw<{ id: string; serijski: string }[]>`
      SELECT u.id::text, u.serijski FROM "Uredaj" u
      WHERE u."firmaId" = ${firmaId}::uuid AND u.stanje = 'U_NAJMU'
        AND NOT EXISTS (SELECT 1 FROM "UredajNaUgovoru" p WHERE p."uredajId" = u.id AND p."firmaId" = u."firmaId" AND (p."do" IS NULL OR p."do" >= CURRENT_DATE))
      LIMIT 1000`,
    db.narudzbenica.findMany({
      where: { firmaId, status: { notIn: ["ZATVORENA", "STORNIRANA"] } },
      select: { id: true, broj: true, status: true, stavke: { select: { kolicina: true, zaprimljeno: true } } },
    }),
  ]);
  const n: Nalaz[] = [];
  for (const x of zaprimljeno)
    n.push({
      vrsta: "ZAPRIMLJENO",
      id: x.id,
      opis: `${x.broj}: zapisano ${x.zapisano}, na primkama ${Number(x.stvarno)}`,
      popravljivo: true,
      vrijednost: Number(x.stvarno),
    });
  for (const x of narudzbe) {
    const s = statusNarudzbe(x.status, x.stavke);
    if (s !== x.status)
      n.push({
        vrsta: "STATUS_NARUDZBE",
        id: x.id,
        opis: `${x.broj}: ${x.status.toLowerCase()} → ${s.toLowerCase()}`,
        popravljivo: true,
        vrijednost: s,
      });
  }
  for (const x of primkeV)
    n.push({
      vrsta: "VRIJEDNOST_PRIMKE",
      id: x.id,
      opis: `${x.broj}: zapisano ${x.zapisano ?? "—"}, uređaji ${x.stvarno}`,
      popravljivo: true,
      vrijednost: x.stvarno,
    });
  for (const x of primkeB)
    n.push({
      vrsta: "BROJ_NA_PRIMCI",
      id: x.id,
      opis: `${x.broj}: zapisano ${x.zapisano}, uređaja ${Number(x.stvarno)}`,
      popravljivo: true,
      vrijednost: Number(x.stvarno),
    });
  for (const x of placeno)
    n.push({
      vrsta: "PLACENO_RACUNA",
      id: x.id,
      opis: `${x.broj ?? "nacrt"}: zapisano ${x.zapisano}, uplate ${x.stvarno}`,
      popravljivo: true,
      vrijednost: x.stvarno,
    });
  for (const x of skladiste) n.push({ vrsta: "STANJE_SKLADISTE", id: x.id, opis: x.serijski, popravljivo: false });
  for (const x of kupac) n.push({ vrsta: "STANJE_KUPAC", id: x.id, opis: x.serijski, popravljivo: false });
  for (const x of najam) n.push({ vrsta: "NAJAM_BEZ_UGOVORA", id: x.id, opis: x.serijski, popravljivo: false });
  return n;
}

/** Popravak svih popravljivih nalaza (u jednoj transakciji, svaki u dnevnik). Vraća broj popravaka. */
export async function popraviDosljednost(db: PrismaClient, akter: Akter): Promise<number> {
  const f = akter.firmaId;
  const nalazi = (await provjeriDosljednost(db, f)).filter((x) => x.popravljivo);
  if (!nalazi.length) return 0;
  await db.$transaction(
    async (tx) => {
      for (const x of nalazi) {
        if (x.vrsta === "ZAPRIMLJENO")
          await tx.stavkaNarudzbenice.updateMany({ where: { id: x.id, firmaId: f }, data: { zaprimljeno: Number(x.vrijednost) } });
        else if (x.vrsta === "STATUS_NARUDZBE")
          await tx.narudzbenica.updateMany({ where: { id: x.id, firmaId: f }, data: { status: String(x.vrijednost) } });
        else if (x.vrsta === "VRIJEDNOST_PRIMKE")
          await tx.primka.updateMany({ where: { id: x.id, firmaId: f }, data: { nabavnaVrijednost: String(x.vrijednost) } });
        else if (x.vrsta === "BROJ_NA_PRIMCI")
          await tx.primka.updateMany({ where: { id: x.id, firmaId: f }, data: { brojUredaja: Number(x.vrijednost) } });
        else if (x.vrsta === "PLACENO_RACUNA")
          await tx.prodajniDokument.updateMany({ where: { id: x.id, firmaId: f }, data: { placeno: String(x.vrijednost) } });
        else continue;
        await zapisiDnevnik(tx, {
          firmaId: f,
          korisnikId: akter.korisnikId,
          ip: akter.ip,
          radnja: "dosljednost.popravak",
          entitet:
            x.vrsta === "PLACENO_RACUNA" ? "ProdajniDokument" : x.vrsta.includes("PRIMK") || x.vrsta === "BROJ_NA_PRIMCI" ? "Primka" : "Narudzbenica",
          entitetId: x.id,
          opis: `Popravak: ${VRSTE_NALAZA[x.vrsta]} — ${x.opis}`,
        });
      }
      // nakon popravka zaprimljenih količina statusi narudžbenica
      const narudzbe = await tx.narudzbenica.findMany({
        where: { firmaId: f, status: { notIn: ["ZATVORENA", "STORNIRANA"] } },
        select: { id: true, status: true, stavke: { select: { kolicina: true, zaprimljeno: true } } },
      });
      for (const n of narudzbe) {
        const s = statusNarudzbe(n.status, n.stavke);
        if (s !== n.status) await tx.narudzbenica.update({ where: { id: n.id }, data: { status: s } });
      }
    },
    { timeout: 120_000 },
  );
  return nalazi.length;
}
