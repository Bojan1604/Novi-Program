import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { jeDatum } from "@/domain/datum";
import { centiIzDecimala } from "@/domain/novac";

/**
 * Marže (samo uz pravo „costs“): prihod = osnovica izdanog dokumenta (bez PDV-a),
 * nabava = nabavne cijene prodanih uređaja na stavkama (storno i odobrenje s minusom, najam se ne računa).
 * Računi za predujam ulaze u prihod, a odbitak predujma na konačnom računu ga poništava — zbroj je ispravan.
 * Zbroj marži dokumenata = marža po mjesecima (isti upit, grupiran).
 */
export type MarzaDokumenta = {
  id: string;
  mjesec: string;
  prihod: number;
  nabava: number;
  marza: number;
  /** prodanih uređaja bez nabavne cijene (marža je tada previsoka) */
  bezNabavne: number;
};

const VRSTE = ["RACUN", "PREDUJAM", "ODOBRENJE", "STORNO"];

type Redak = { id: string; mjesec: string; osnovica: Prisma.Decimal; nabava: Prisma.Decimal | null; bez_nabavne: bigint };

export async function marzeDokumenata(
  db: Pick<PrismaClient, "$queryRaw">,
  firmaId: string,
  u: { ids?: string[]; od?: string; do?: string },
): Promise<MarzaDokumenta[]> {
  if (u.ids && u.ids.length === 0) return [];
  const uvjeti = [Prisma.sql`d."firmaId" = ${firmaId}::uuid`, Prisma.sql`d.vrsta IN (${Prisma.join(VRSTE)})`, Prisma.sql`d.status <> 'NACRT'`];
  if (u.ids) uvjeti.push(Prisma.sql`d.id IN (${Prisma.join(u.ids.map((x) => Prisma.sql`${x}::uuid`))})`);
  if (u.od && jeDatum(u.od)) uvjeti.push(Prisma.sql`d.datum >= ${u.od}::date`);
  if (u.do && jeDatum(u.do)) uvjeti.push(Prisma.sql`d.datum <= ${u.do}::date`);
  const redovi = await db.$queryRaw<Redak[]>`
    SELECT d.id::text AS id, to_char(d.datum, 'YYYY-MM') AS mjesec, d.osnovica,
      (SELECT SUM(CASE WHEN s.kolicina < 0 THEN -u."nabavnaCijena" ELSE u."nabavnaCijena" END)
         FROM "StavkaProdajnogDokumenta" s
         JOIN "UredajNaStavci" us ON us."stavkaId" = s.id AND us."firmaId" = s."firmaId"
         JOIN "Uredaj" u ON u.id = us."uredajId" AND u."firmaId" = us."firmaId"
        WHERE s."dokumentId" = d.id AND s."firmaId" = d."firmaId" AND s.namjena = 'PRODAJA') AS nabava,
      (SELECT COUNT(*)
         FROM "StavkaProdajnogDokumenta" s
         JOIN "UredajNaStavci" us ON us."stavkaId" = s.id AND us."firmaId" = s."firmaId"
         JOIN "Uredaj" u ON u.id = us."uredajId" AND u."firmaId" = us."firmaId"
        WHERE s."dokumentId" = d.id AND s."firmaId" = d."firmaId" AND s.namjena = 'PRODAJA' AND u."nabavnaCijena" IS NULL) AS bez_nabavne
    FROM "ProdajniDokument" d
    WHERE ${Prisma.join(uvjeti, " AND ")}
    ORDER BY d.datum, d.id`;
  return redovi.map((r) => {
    const prihod = centiIzDecimala(r.osnovica.toFixed(2));
    const nabava = r.nabava ? centiIzDecimala(r.nabava.toFixed(2)) : 0;
    return { id: r.id, mjesec: r.mjesec, prihod, nabava, marza: prihod - nabava, bezNabavne: Number(r.bez_nabavne) };
  });
}

export type MarzaMjeseca = { mjesec: string; dokumenata: number; prihod: number; nabava: number; marza: number; bezNabavne: number };

/** Zbroj po mjesecima (od najnovijeg). */
export function poMjesecima(dokumenti: readonly MarzaDokumenta[]): MarzaMjeseca[] {
  const m = new Map<string, MarzaMjeseca>();
  for (const d of dokumenti) {
    const x = m.get(d.mjesec) ?? { mjesec: d.mjesec, dokumenata: 0, prihod: 0, nabava: 0, marza: 0, bezNabavne: 0 };
    x.dokumenata++;
    x.prihod += d.prihod;
    x.nabava += d.nabava;
    x.marza += d.marza;
    x.bezNabavne += d.bezNabavne;
    m.set(d.mjesec, x);
  }
  return [...m.values()].sort((a, b) => b.mjesec.localeCompare(a.mjesec));
}

/** Postotak marže u odnosu na prihod (stotinke %), null kad nema prihoda. */
export function postotakMarze(marza: number, prihod: number): number | null {
  return prihod === 0 ? null : Math.round((marza * 10000) / prihod);
}
