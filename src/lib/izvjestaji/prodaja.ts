import { Prisma } from "@/generated/prisma/client";
import { broj, centi, i, uuidovi, uvjetDatuma } from "./pomoc";
import type { FiltriUpita, Izvjestaj } from "./tipovi";

/**
 * Prihod = osnovica (bez PDV-a) izdanih računa, predujmova, odobrenja i storna (odobrenje i storno s minusom).
 * Svi izvještaji prihoda koriste ISTI uvjet dokumenata, pa se zbrojevi slažu do centa.
 */
const PRAVA_PRODAJE = [
  { modul: "izvjestaji", razina: "pregled" },
  { modul: "prodaja", razina: "pregled" },
] as const;

export function uvjetPrihoda(firmaId: string, f: FiltriUpita): Prisma.Sql {
  const u = [
    Prisma.sql`d."firmaId" = ${firmaId}::uuid`,
    Prisma.sql`d.vrsta IN ('RACUN', 'PREDUJAM', 'ODOBRENJE', 'STORNO')`,
    Prisma.sql`d.status <> 'NACRT'`,
    ...uvjetDatuma(Prisma.sql`d.datum`, f.od, f.do),
  ];
  const partneri = uuidovi(f.vise["partner"] ?? []);
  if (partneri.length) u.push(Prisma.sql`d."partnerId" IN (${Prisma.join(partneri.map((x) => Prisma.sql`${x}::uuid`))})`);
  if (f.trazi)
    u.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Partner" p WHERE p.id = d."partnerId" AND p."firmaId" = d."firmaId" AND p.naziv ILIKE ${`%${f.trazi}%`})`,
    );
  return i(u);
}

export const PRIHOD_PO_MJESECIMA: Izvjestaj = {
  kljuc: "prihod-mjeseci",
  naziv: "Prihod po mjesecima",
  opis: "Osnovica, PDV i ukupno izdanih dokumenata po mjesecu.",
  grupa: "Prodaja",
  prava: [...PRAVA_PRODAJE],
  razdoblje: true,
  trazi: "Kupac",
  stupci: [
    { kljuc: "mjesec", naslov: "Mjesec", vrijednost: (r) => r["mjesec"], sort: Prisma.sql`mjesec` },
    { kljuc: "dokumenata", naslov: "Dokumenata", vrsta: "broj", vrijednost: (r) => r["dokumenata"], zbroj: true, sort: Prisma.sql`dokumenata` },
    { kljuc: "osnovica", naslov: "Osnovica", vrsta: "iznos", vrijednost: (r) => r["osnovica"], zbroj: true, sort: Prisma.sql`osnovica` },
    { kljuc: "pdv", naslov: "PDV", vrsta: "iznos", vrijednost: (r) => r["pdv"], zbroj: true, sort: Prisma.sql`pdv` },
    { kljuc: "ukupno", naslov: "Ukupno", vrsta: "iznos", vrijednost: (r) => r["ukupno"], zbroj: true, sort: Prisma.sql`ukupno` },
  ],
  zadanoSortiranje: { kljuc: "mjesec", smjer: "desc" },
  async upit(db, firmaId, f, s) {
    const w = uvjetPrihoda(firmaId, f);
    const [redovi, [z]] = await Promise.all([
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT to_char(d.datum, 'YYYY-MM') AS mjesec, COUNT(*) AS dokumenata, SUM(d.osnovica) AS osnovica, SUM(d.pdv) AS pdv, SUM(d.ukupno) AS ukupno
        FROM "ProdajniDokument" d WHERE ${w} GROUP BY 1 ORDER BY ${s.sort}, 1 LIMIT ${s.take} OFFSET ${s.skip}`,
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(DISTINCT to_char(d.datum, 'YYYY-MM')) AS grupa, COUNT(*) AS dokumenata, SUM(d.osnovica) AS osnovica, SUM(d.pdv) AS pdv, SUM(d.ukupno) AS ukupno
        FROM "ProdajniDokument" d WHERE ${w}`,
    ]);
    return {
      redovi: redovi.map((r) => ({
        mjesec: String(r["mjesec"]),
        dokumenata: broj(r["dokumenata"]),
        osnovica: centi(r["osnovica"]),
        pdv: centi(r["pdv"]),
        ukupno: centi(r["ukupno"]),
      })),
      ukupno: broj(z!["grupa"]),
      zbroj: { dokumenata: broj(z!["dokumenata"]), osnovica: centi(z!["osnovica"]), pdv: centi(z!["pdv"]), ukupno: centi(z!["ukupno"]) },
    };
  },
};

export const PRIHOD_PO_KUPCU: Izvjestaj = {
  kljuc: "prihod-kupci",
  naziv: "Prihod po kupcu",
  opis: "Osnovica izdanih dokumenata po kupcu, s udjelom u ukupnom prihodu.",
  grupa: "Prodaja",
  prava: [...PRAVA_PRODAJE],
  razdoblje: true,
  trazi: "Kupac",
  stupci: [
    {
      kljuc: "kupac",
      naslov: "Kupac",
      vrijednost: (r) => r["kupac"],
      sort: Prisma.sql`kupac`,
      veza: (r) => (r["partnerId"] ? `/partneri/${r["partnerId"]}` : null),
    },
    { kljuc: "oib", naslov: "OIB", vrijednost: (r) => r["oib"] },
    { kljuc: "dokumenata", naslov: "Dokumenata", vrsta: "broj", vrijednost: (r) => r["dokumenata"], zbroj: true, sort: Prisma.sql`dokumenata` },
    { kljuc: "osnovica", naslov: "Osnovica", vrsta: "iznos", vrijednost: (r) => r["osnovica"], zbroj: true, sort: Prisma.sql`osnovica` },
    { kljuc: "ukupno", naslov: "Ukupno s PDV-om", vrsta: "iznos", vrijednost: (r) => r["ukupno"], zbroj: true, sort: Prisma.sql`ukupno` },
    { kljuc: "udio", naslov: "Udio", vrsta: "tekst", vrijednost: (r) => r["udio"] },
  ],
  zadanoSortiranje: { kljuc: "osnovica", smjer: "desc" },
  async upit(db, firmaId, f, s) {
    const w = uvjetPrihoda(firmaId, f);
    const [redovi, [z]] = await Promise.all([
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT d."partnerId"::text AS "partnerId", COALESCE(p.naziv, 'Bez kupca') AS kupac, p.oib, COUNT(*) AS dokumenata, SUM(d.osnovica) AS osnovica, SUM(d.ukupno) AS ukupno
        FROM "ProdajniDokument" d LEFT JOIN "Partner" p ON p.id = d."partnerId" AND p."firmaId" = d."firmaId"
        WHERE ${w} GROUP BY d."partnerId", p.naziv, p.oib ORDER BY ${s.sort}, kupac LIMIT ${s.take} OFFSET ${s.skip}`,
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(DISTINCT COALESCE(d."partnerId"::text, '-')) AS grupa, COUNT(*) AS dokumenata, SUM(d.osnovica) AS osnovica, SUM(d.ukupno) AS ukupno
        FROM "ProdajniDokument" d WHERE ${w}`,
    ]);
    const ukupnaOsnovica = centi(z!["osnovica"]);
    return {
      redovi: redovi.map((r) => {
        const o = centi(r["osnovica"]);
        return {
          partnerId: (r["partnerId"] as string | null) ?? null,
          kupac: String(r["kupac"]),
          oib: (r["oib"] as string | null) ?? null,
          dokumenata: broj(r["dokumenata"]),
          osnovica: o,
          ukupno: centi(r["ukupno"]),
          udio: ukupnaOsnovica ? `${((o * 100) / ukupnaOsnovica).toFixed(1).replace(".", ",")} %` : null,
        };
      }),
      ukupno: broj(z!["grupa"]),
      zbroj: { dokumenata: broj(z!["dokumenata"]), osnovica: ukupnaOsnovica, ukupno: centi(z!["ukupno"]) },
    };
  },
};

export const PRIHOD_PO_MODELU: Izvjestaj = {
  kljuc: "prihod-modeli",
  naziv: "Prihod po modelu",
  opis: "Iznos stavki po modelu uređaja; usluge i stavke bez modela zajedno, a popust na dokument i zaokruživanje zasebnim retkom — zbroj je jednak prihodu.",
  grupa: "Prodaja",
  prava: [...PRAVA_PRODAJE],
  razdoblje: true,
  trazi: "Kupac",
  stupci: [
    { kljuc: "model", naslov: "Model", vrijednost: (r) => r["model"], sort: Prisma.sql`model` },
    { kljuc: "kolicina", naslov: "Količina", vrsta: "broj", vrijednost: (r) => r["kolicina"], zbroj: true, sort: Prisma.sql`kolicina` },
    { kljuc: "iznos", naslov: "Iznos (osnovica)", vrsta: "iznos", vrijednost: (r) => r["iznos"], zbroj: true, sort: Prisma.sql`iznos` },
  ],
  zadanoSortiranje: { kljuc: "iznos", smjer: "desc" },
  async upit(db, firmaId, f, s) {
    const w = uvjetPrihoda(firmaId, f);
    const skup = Prisma.sql`
      WITH d AS (SELECT d.id, d."firmaId", d.osnovica FROM "ProdajniDokument" d WHERE ${w}),
      st AS (
        SELECT COALESCE(s."modelId", u."modelId") AS "modelId", s.kolicina, s.iznos
        FROM "StavkaProdajnogDokumenta" s JOIN d ON d.id = s."dokumentId" AND d."firmaId" = s."firmaId"
        LEFT JOIN "Uredaj" u ON u.id = s."uredajId" AND u."firmaId" = s."firmaId"
      ),
      grupe AS (
        SELECT st."modelId"::text AS kljuc, COALESCE(m.naziv, 'Usluge i ostalo (bez modela)') AS model,
          CASE WHEN st."modelId" IS NULL THEN NULL ELSE SUM(st.kolicina) / 1000.0 END AS kolicina, SUM(st.iznos) AS iznos
        FROM st LEFT JOIN "ModelUredaja" m ON m.id = st."modelId" AND m."firmaId" = ${firmaId}::uuid
        GROUP BY st."modelId", m.naziv
        UNION ALL
        SELECT 'razlika', 'Popust na dokument i zaokruživanje', NULL, r.iznos
        FROM (SELECT (SELECT COALESCE(SUM(osnovica), 0) FROM d) - (SELECT COALESCE(SUM(iznos), 0) FROM st) AS iznos) r
        WHERE r.iznos <> 0
      )`;
    const [redovi, [z]] = await Promise.all([
      db.$queryRaw<Record<string, unknown>[]>`${skup} SELECT * FROM grupe ORDER BY ${s.sort}, model LIMIT ${s.take} OFFSET ${s.skip}`,
      db.$queryRaw<Record<string, unknown>[]>`${skup} SELECT COUNT(*) AS grupa, SUM(kolicina) AS kolicina, SUM(iznos) AS iznos FROM grupe`,
    ]);
    return {
      redovi: redovi.map((r) => ({
        model: String(r["model"]),
        kolicina: r["kolicina"] === null ? null : broj(r["kolicina"]),
        iznos: centi(r["iznos"]),
      })),
      ukupno: broj(z!["grupa"]),
      zbroj: { kolicina: broj(z!["kolicina"]), iznos: centi(z!["iznos"]) },
    };
  },
};
