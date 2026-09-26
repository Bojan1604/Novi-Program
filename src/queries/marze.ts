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

function uvjetiDokumenata(firmaId: string, u: { ids?: string[]; od?: string; do?: string }): Prisma.Sql {
  const uvjeti = [Prisma.sql`d."firmaId" = ${firmaId}::uuid`, Prisma.sql`d.vrsta IN (${Prisma.join(VRSTE)})`, Prisma.sql`d.status <> 'NACRT'`];
  if (u.ids) uvjeti.push(Prisma.sql`d.id IN (${Prisma.join(u.ids.map((x) => Prisma.sql`${x}::uuid`))})`);
  if (u.od && jeDatum(u.od)) uvjeti.push(Prisma.sql`d.datum >= ${u.od}::date`);
  if (u.do && jeDatum(u.do)) uvjeti.push(Prisma.sql`d.datum <= ${u.do}::date`);
  return Prisma.join(uvjeti, " AND ");
}

/**
 * Dokumenti i nabava njihovih prodanih uređaja: nabava se grupira jednom (od veza uređaja na stavke, kojih je
 * malo), ne podupitom po dokumentu — 100.000 računa bez toga traje sekundama.
 */
function sDokumentima(firmaId: string, uvjeti: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    WITH d AS (SELECT d.id, d.datum, d.osnovica FROM "ProdajniDokument" d WHERE ${uvjeti}),
    n AS (
      SELECT s."dokumentId" AS id,
        SUM(CASE WHEN s.kolicina < 0 THEN -u."nabavnaCijena" ELSE u."nabavnaCijena" END) AS nabava,
        COUNT(*) FILTER (WHERE u."nabavnaCijena" IS NULL) AS bez_nabavne
      FROM "UredajNaStavci" us
      JOIN "StavkaProdajnogDokumenta" s ON s.id = us."stavkaId" AND s."firmaId" = us."firmaId"
      JOIN "Uredaj" u ON u.id = us."uredajId" AND u."firmaId" = us."firmaId"
      WHERE us."firmaId" = ${firmaId}::uuid AND s.namjena = 'PRODAJA' AND s."dokumentId" IN (SELECT id FROM d)
      GROUP BY s."dokumentId")`;
}

export async function marzeDokumenata(
  db: Pick<PrismaClient, "$queryRaw">,
  firmaId: string,
  u: { ids?: string[]; od?: string; do?: string },
): Promise<MarzaDokumenta[]> {
  if (u.ids && u.ids.length === 0) return [];
  const redovi = await db.$queryRaw<Redak[]>`
    ${sDokumentima(firmaId, uvjetiDokumenata(firmaId, u))}
    SELECT d.id::text AS id, to_char(d.datum, 'YYYY-MM') AS mjesec, d.osnovica, n.nabava, COALESCE(n.bez_nabavne, 0) AS bez_nabavne
    FROM d LEFT JOIN n ON n.id = d.id
    ORDER BY d.datum, d.id`;
  return redovi.map((r) => {
    const prihod = centiIzDecimala(r.osnovica.toFixed(2));
    const nabava = r.nabava ? centiIzDecimala(r.nabava.toFixed(2)) : 0;
    return { id: r.id, mjesec: r.mjesec, prihod, nabava, marza: prihod - nabava, bezNabavne: Number(r.bez_nabavne) };
  });
}

export type MarzaMjeseca = { mjesec: string; dokumenata: number; prihod: number; nabava: number; marza: number; bezNabavne: number };

/** Marže po mjesecima (od najnovijeg), grupirano u bazi — isti izvor kao `marzeDokumenata`. */
export async function marzePoMjesecima(
  db: Pick<PrismaClient, "$queryRaw">,
  firmaId: string,
  u: { od?: string; do?: string },
): Promise<MarzaMjeseca[]> {
  const r = await db.$queryRaw<{ mjesec: string; dokumenata: bigint; prihod: Prisma.Decimal; nabava: Prisma.Decimal | null; bez_nabavne: bigint }[]>`
    ${sDokumentima(firmaId, uvjetiDokumenata(firmaId, u))}
    SELECT to_char(d.datum, 'YYYY-MM') AS mjesec, COUNT(*) AS dokumenata, SUM(d.osnovica) AS prihod,
      SUM(n.nabava) AS nabava, COALESCE(SUM(n.bez_nabavne), 0) AS bez_nabavne
    FROM d LEFT JOIN n ON n.id = d.id
    GROUP BY 1 ORDER BY 1 DESC`;
  return r.map((x) => {
    const prihod = centiIzDecimala(x.prihod.toFixed(2));
    const nabava = x.nabava ? centiIzDecimala(x.nabava.toFixed(2)) : 0;
    return { mjesec: x.mjesec, dokumenata: Number(x.dokumenata), prihod, nabava, marza: prihod - nabava, bezNabavne: Number(x.bez_nabavne) };
  });
}

/** Zbroj po mjesecima (od najnovijeg) iz popisa dokumenata. */
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
