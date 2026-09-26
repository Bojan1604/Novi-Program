import { Prisma } from "@/generated/prisma/client";
import { danas } from "@/domain/datum";
import { postotakMarze, poMjesecima, marzeDokumenata } from "@/queries/marze";
import { pregledTroskova } from "@/services/troskovi";
import { STATUSI_SERVISA } from "@/domain/servis";
import { broj, centi, i, uuidovi, uvjetDatuma } from "./pomoc";
import type { Izvjestaj, Redak, RezultatIzvjestaja, StranicaUpita } from "./tipovi";

const IZ = { modul: "izvjestaji", razina: "pregled" } as const;

/** Stranica i sortiranje u memoriji za izvještaje čiji se skup gradi pravilom iz servisa (mali skupovi). */
function uMemoriji(redovi: Redak[], s: StranicaUpita, kljuc: string, smjer: "asc" | "desc", zbroj: Redak): RezultatIzvjestaja {
  const k = smjer === "asc" ? 1 : -1;
  const poredani = [...redovi].sort((a, b) => {
    const x = a[kljuc];
    const y = b[kljuc];
    if (typeof x === "number" && typeof y === "number") return (x - y) * k;
    return String(x ?? "").localeCompare(String(y ?? ""), "hr") * k;
  });
  return { redovi: poredani.slice(s.skip, s.skip + s.take), ukupno: redovi.length, zbroj };
}

// ——— najam ———

export const NAJAM_PO_UGOVORU: Izvjestaj = {
  kljuc: "najam-ugovori",
  naziv: "Najam po ugovoru",
  opis: "Fakturirane rate najma u razdoblju po ugovoru (i one izdane izvan programa).",
  grupa: "Najam",
  prava: [IZ, { modul: "najam", razina: "pregled" }],
  razdoblje: true,
  trazi: "Klijent ili broj ugovora",
  stupci: [
    { kljuc: "ugovor", naslov: "Ugovor", vrijednost: (r) => r["ugovor"], sort: Prisma.sql`ugovor`, veza: (r) => `/najam/${r["ugovorId"]}` },
    { kljuc: "klijent", naslov: "Klijent", vrijednost: (r) => r["klijent"], sort: Prisma.sql`klijent` },
    { kljuc: "uredaja", naslov: "Uređaja", vrsta: "broj", vrijednost: (r) => r["uredaja"], zbroj: true, sort: Prisma.sql`uredaja` },
    { kljuc: "rata", naslov: "Rata (mjeseci)", vrsta: "broj", vrijednost: (r) => r["rata"], zbroj: true, sort: Prisma.sql`rata` },
    { kljuc: "iznos", naslov: "Fakturirano", vrsta: "iznos", vrijednost: (r) => r["iznos"], zbroj: true, sort: Prisma.sql`iznos` },
  ],
  zadanoSortiranje: { kljuc: "iznos", smjer: "desc" },
  async upit(db, firmaId, f, s) {
    const u = [Prisma.sql`r."firmaId" = ${firmaId}::uuid`, ...uvjetDatuma(Prisma.sql`r.mjesec`, f.od, f.do)];
    if (f.trazi) u.push(Prisma.sql`(g.broj ILIKE ${`%${f.trazi}%`} OR p.naziv ILIKE ${`%${f.trazi}%`})`);
    const w = i(u);
    const iz = Prisma.sql`FROM "RataNajma" r
      JOIN "UredajNaUgovoru" pl ON pl.id = r."planId" AND pl."firmaId" = r."firmaId"
      JOIN "UgovorNajma" g ON g.id = pl."ugovorId" AND g."firmaId" = pl."firmaId"
      JOIN "Partner" p ON p.id = g."partnerId" AND p."firmaId" = g."firmaId"`;
    const [redovi, [z]] = await Promise.all([
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT g.id::text AS "ugovorId", g.broj AS ugovor, p.naziv AS klijent, COUNT(DISTINCT pl."uredajId") AS uredaja, COUNT(*) AS rata, SUM(r.iznos) AS iznos
        ${iz} WHERE ${w} GROUP BY g.id, g.broj, p.naziv ORDER BY ${s.sort}, ugovor LIMIT ${s.take} OFFSET ${s.skip}`,
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(DISTINCT g.id) AS grupa, COUNT(DISTINCT pl."uredajId") AS uredaja, COUNT(*) AS rata, SUM(r.iznos) AS iznos ${iz} WHERE ${w}`,
    ]);
    return {
      redovi: redovi.map((r) => ({
        ugovorId: String(r["ugovorId"]),
        ugovor: String(r["ugovor"]),
        klijent: String(r["klijent"]),
        uredaja: broj(r["uredaja"]),
        rata: broj(r["rata"]),
        iznos: centi(r["iznos"]),
      })),
      ukupno: broj(z!["grupa"]),
      zbroj: { uredaja: broj(z!["uredaja"]), rata: broj(z!["rata"]), iznos: centi(z!["iznos"]) },
    };
  },
};

// ——— zaliha ———

export const ZALIHA_PO_MODELU: Izvjestaj = {
  kljuc: "zaliha-modeli",
  naziv: "Zaliha po modelu",
  opis: "Uređaji na skladištu (i rezervirani) sada, po modelu i skladištu; nabavna vrijednost samo uz pravo nabavnih cijena.",
  grupa: "Skladište",
  prava: [IZ, { modul: "uredaji", razina: "pregled" }],
  razdoblje: false,
  trazi: "Model",
  vise: [
    {
      kljuc: "skladiste",
      oznaka: "Skladište",
      opcije: async (db, firmaId) =>
        (await db.skladiste.findMany({ where: { firmaId }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true } })).map((x) => ({
          vrijednost: x.id,
          naziv: x.naziv,
        })),
    },
  ],
  stupci: [
    { kljuc: "model", naslov: "Model", vrijednost: (r) => r["model"], sort: Prisma.sql`model` },
    { kljuc: "skladiste", naslov: "Skladište", vrijednost: (r) => r["skladiste"], sort: Prisma.sql`skladiste` },
    {
      kljuc: "naSkladistu",
      naslov: "Na skladištu",
      vrsta: "broj",
      vrijednost: (r) => r["naSkladistu"],
      zbroj: true,
      sort: Prisma.sql`"naSkladistu"`,
    },
    { kljuc: "rezervirano", naslov: "Rezervirano", vrsta: "broj", vrijednost: (r) => r["rezervirano"], zbroj: true, sort: Prisma.sql`rezervirano` },
    {
      kljuc: "vrijednost",
      naslov: "Nabavna vrijednost",
      vrsta: "iznos",
      osjetljivo: true,
      vrijednost: (r) => r["vrijednost"],
      zbroj: true,
      sort: Prisma.sql`vrijednost`,
    },
  ],
  zadanoSortiranje: { kljuc: "naSkladistu", smjer: "desc" },
  async upit(db, firmaId, f, s) {
    const u = [Prisma.sql`u."firmaId" = ${firmaId}::uuid`, Prisma.sql`u.stanje IN ('NA_SKLADISTU', 'REZERVIRAN')`];
    const skl = uuidovi(f.vise["skladiste"] ?? []);
    if (skl.length) u.push(Prisma.sql`u."skladisteId" IN (${Prisma.join(skl.map((x) => Prisma.sql`${x}::uuid`))})`);
    if (f.trazi) u.push(Prisma.sql`m.naziv ILIKE ${`%${f.trazi}%`}`);
    const w = i(u);
    const iz = Prisma.sql`FROM "Uredaj" u JOIN "ModelUredaja" m ON m.id = u."modelId" AND m."firmaId" = u."firmaId"
      LEFT JOIN "Skladiste" k ON k.id = u."skladisteId" AND k."firmaId" = u."firmaId"`;
    const [redovi, [z]] = await Promise.all([
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT m.naziv AS model, COALESCE(k.naziv, '—') AS skladiste,
          COUNT(*) FILTER (WHERE u.stanje = 'NA_SKLADISTU') AS "naSkladistu", COUNT(*) FILTER (WHERE u.stanje = 'REZERVIRAN') AS rezervirano,
          SUM(u."nabavnaCijena") AS vrijednost
        ${iz} WHERE ${w} GROUP BY m.naziv, k.naziv ORDER BY ${s.sort}, model LIMIT ${s.take} OFFSET ${s.skip}`,
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(DISTINCT (m.naziv, k.naziv)) AS grupa, COUNT(*) FILTER (WHERE u.stanje = 'NA_SKLADISTU') AS "naSkladistu",
          COUNT(*) FILTER (WHERE u.stanje = 'REZERVIRAN') AS rezervirano, SUM(u."nabavnaCijena") AS vrijednost ${iz} WHERE ${w}`,
    ]);
    return {
      redovi: redovi.map((r) => ({
        model: String(r["model"]),
        skladiste: String(r["skladiste"]),
        naSkladistu: broj(r["naSkladistu"]),
        rezervirano: broj(r["rezervirano"]),
        vrijednost: centi(r["vrijednost"]),
      })),
      ukupno: broj(z!["grupa"]),
      zbroj: { naSkladistu: broj(z!["naSkladistu"]), rezervirano: broj(z!["rezervirano"]), vrijednost: centi(z!["vrijednost"]) },
    };
  },
};

// ——— potraživanja ———

export const POTRAZIVANJA: Izvjestaj = {
  kljuc: "potrazivanja",
  naziv: "Potraživanja po kupcu",
  opis: "Otvoreni iznosi izdanih računa danas: dospjelo, nije dospjelo i najstarije dospijeće.",
  grupa: "Prodaja",
  prava: [IZ, { modul: "prodaja", razina: "pregled" }],
  razdoblje: false,
  trazi: "Kupac",
  stupci: [
    {
      kljuc: "kupac",
      naslov: "Kupac",
      vrijednost: (r) => r["kupac"],
      sort: Prisma.sql`kupac`,
      veza: (r) => (r["partnerId"] ? `/partneri/${r["partnerId"]}` : null),
    },
    { kljuc: "racuna", naslov: "Računa", vrsta: "broj", vrijednost: (r) => r["racuna"], zbroj: true, sort: Prisma.sql`racuna` },
    { kljuc: "otvoreno", naslov: "Otvoreno", vrsta: "iznos", vrijednost: (r) => r["otvoreno"], zbroj: true, sort: Prisma.sql`otvoreno` },
    { kljuc: "dospjelo", naslov: "Dospjelo", vrsta: "iznos", vrijednost: (r) => r["dospjelo"], zbroj: true, sort: Prisma.sql`dospjelo` },
    {
      kljuc: "nijeDospjelo",
      naslov: "Nije dospjelo",
      vrsta: "iznos",
      vrijednost: (r) => r["nijeDospjelo"],
      zbroj: true,
      sort: Prisma.sql`"nijeDospjelo"`,
    },
    { kljuc: "najstarije", naslov: "Najstarije dospijeće", vrsta: "datum", vrijednost: (r) => r["najstarije"], sort: Prisma.sql`najstarije` },
  ],
  zadanoSortiranje: { kljuc: "dospjelo", smjer: "desc" },
  async upit(db, firmaId, f, s) {
    const dan = danas();
    const u = [
      Prisma.sql`d."firmaId" = ${firmaId}::uuid`,
      Prisma.sql`d.vrsta IN ('RACUN', 'PREDUJAM')`,
      Prisma.sql`d.status = 'IZDAN'`,
      Prisma.sql`d.ukupno - d.placeno > 0`,
    ];
    if (f.trazi) u.push(Prisma.sql`p.naziv ILIKE ${`%${f.trazi}%`}`);
    const w = i(u);
    const iz = Prisma.sql`FROM "ProdajniDokument" d LEFT JOIN "Partner" p ON p.id = d."partnerId" AND p."firmaId" = d."firmaId"`;
    const dosp = Prisma.sql`COALESCE(d.dospijece, d.datum) < ${dan}::date`;
    const [redovi, [z]] = await Promise.all([
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT d."partnerId"::text AS "partnerId", COALESCE(p.naziv, 'Bez kupca') AS kupac, COUNT(*) AS racuna, SUM(d.ukupno - d.placeno) AS otvoreno,
          COALESCE(SUM(d.ukupno - d.placeno) FILTER (WHERE ${dosp}), 0) AS dospjelo,
          COALESCE(SUM(d.ukupno - d.placeno) FILTER (WHERE NOT ${dosp}), 0) AS "nijeDospjelo",
          to_char(MIN(COALESCE(d.dospijece, d.datum)), 'YYYY-MM-DD') AS najstarije
        ${iz} WHERE ${w} GROUP BY d."partnerId", p.naziv ORDER BY ${s.sort}, kupac LIMIT ${s.take} OFFSET ${s.skip}`,
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(DISTINCT COALESCE(d."partnerId"::text, '-')) AS grupa, COUNT(*) AS racuna, SUM(d.ukupno - d.placeno) AS otvoreno,
          COALESCE(SUM(d.ukupno - d.placeno) FILTER (WHERE ${dosp}), 0) AS dospjelo,
          COALESCE(SUM(d.ukupno - d.placeno) FILTER (WHERE NOT ${dosp}), 0) AS "nijeDospjelo"
        ${iz} WHERE ${w}`,
    ]);
    return {
      redovi: redovi.map((r) => ({
        partnerId: (r["partnerId"] as string | null) ?? null,
        kupac: String(r["kupac"]),
        racuna: broj(r["racuna"]),
        otvoreno: centi(r["otvoreno"]),
        dospjelo: centi(r["dospjelo"]),
        nijeDospjelo: centi(r["nijeDospjelo"]),
        najstarije: (r["najstarije"] as string | null) ?? null,
      })),
      ukupno: broj(z!["grupa"]),
      zbroj: {
        racuna: broj(z!["racuna"]),
        otvoreno: centi(z!["otvoreno"]),
        dospjelo: centi(z!["dospjelo"]),
        nijeDospjelo: centi(z!["nijeDospjelo"]),
      },
    };
  },
};

// ——— troškovi ———

export const TROSKOVI_PO_KATEGORIJI: Izvjestaj = {
  kljuc: "troskovi-kategorije",
  naziv: "Troškovi po kategoriji",
  opis: "Isto pravilo kao na stranici Troškovi (ručni, ponavljajući, ulazni računi, trošak robe po narudžbenici — roba samo uz pravo nabavnih cijena).",
  grupa: "Troškovi",
  prava: [IZ, { modul: "troskovi", razina: "pregled" }],
  razdoblje: true,
  stupci: [
    { kljuc: "kategorija", naslov: "Kategorija", vrijednost: (r) => r["kategorija"], sort: Prisma.sql`kategorija` },
    { kljuc: "stavki", naslov: "Stavki", vrsta: "broj", vrijednost: (r) => r["stavki"], zbroj: true, sort: Prisma.sql`stavki` },
    { kljuc: "iznos", naslov: "Iznos (bez PDV-a)", vrsta: "iznos", vrijednost: (r) => r["iznos"], zbroj: true, sort: Prisma.sql`iznos` },
    { kljuc: "neplaceno", naslov: "Neplaćeno", vrsta: "iznos", vrijednost: (r) => r["neplaceno"], zbroj: true, sort: Prisma.sql`neplaceno` },
  ],
  zadanoSortiranje: { kljuc: "iznos", smjer: "desc" },
  async upit(db, firmaId, f, s) {
    const t = await pregledTroskova(db, firmaId, f.prava, f.od ?? "2000-01-01", f.do ?? "2100-12-31");
    const m = new Map<string, { kategorija: string; stavki: number; iznos: number; neplaceno: number }>();
    for (const x of t) {
      const g = m.get(x.kategorija) ?? { kategorija: x.kategorija, stavki: 0, iznos: 0, neplaceno: 0 };
      g.stavki++;
      g.iznos += x.iznos;
      if (!x.placeno) g.neplaceno += x.iznos;
      m.set(x.kategorija, g);
    }
    const redovi = [...m.values()];
    const zbroj = { stavki: t.length, iznos: redovi.reduce((a, x) => a + x.iznos, 0), neplaceno: redovi.reduce((a, x) => a + x.neplaceno, 0) };
    return uMemoriji(redovi, s, f.sort.kljuc, f.sort.smjer, zbroj);
  },
};

// ——— marže ———

export const MARZE_PO_MJESECIMA: Izvjestaj = {
  kljuc: "marze-mjeseci",
  naziv: "Marža po mjesecima",
  opis: "Prihod, nabavna vrijednost prodanih uređaja i marža (samo uz pravo nabavnih cijena).",
  grupa: "Prodaja",
  prava: [IZ, { modul: "prodaja", razina: "pregled", posebno: "costs" }],
  razdoblje: true,
  stupci: [
    { kljuc: "mjesec", naslov: "Mjesec", vrijednost: (r) => r["mjesec"], sort: Prisma.sql`mjesec` },
    { kljuc: "dokumenata", naslov: "Dokumenata", vrsta: "broj", vrijednost: (r) => r["dokumenata"], zbroj: true, sort: Prisma.sql`dokumenata` },
    { kljuc: "prihod", naslov: "Prihod", vrsta: "iznos", vrijednost: (r) => r["prihod"], zbroj: true, sort: Prisma.sql`prihod` },
    { kljuc: "nabava", naslov: "Nabava", vrsta: "iznos", osjetljivo: true, vrijednost: (r) => r["nabava"], zbroj: true, sort: Prisma.sql`nabava` },
    { kljuc: "marza", naslov: "Marža", vrsta: "iznos", osjetljivo: true, vrijednost: (r) => r["marza"], zbroj: true, sort: Prisma.sql`marza` },
    { kljuc: "postotak", naslov: "Marža %", osjetljivo: true, vrijednost: (r) => r["postotak"] },
  ],
  zadanoSortiranje: { kljuc: "mjesec", smjer: "desc" },
  async upit(db, firmaId, f, s) {
    const d = await marzeDokumenata(db, firmaId, { ...(f.od ? { od: f.od } : {}), ...(f.do ? { do: f.do } : {}) });
    const p = (m: number, pr: number) => {
      const x = postotakMarze(m, pr);
      return x === null ? null : `${(x / 100).toFixed(1).replace(".", ",")} %`;
    };
    const redovi = poMjesecima(d).map((x) => ({ ...x, postotak: p(x.marza, x.prihod) }));
    const z = redovi.reduce(
      (a, x) => ({ dokumenata: a.dokumenata + x.dokumenata, prihod: a.prihod + x.prihod, nabava: a.nabava + x.nabava, marza: a.marza + x.marza }),
      {
        dokumenata: 0,
        prihod: 0,
        nabava: 0,
        marza: 0,
      },
    );
    return uMemoriji(redovi, s, f.sort.kljuc, f.sort.smjer, { ...z, postotak: p(z.marza, z.prihod) });
  },
};

// ——— servis ———

export const SERVIS_PO_MJESECIMA: Izvjestaj = {
  kljuc: "servis-mjeseci",
  naziv: "Servis po mjesecima",
  opis: "Zaprimljeni nalozi po mjesecu prijema: koliko je završeno, vraćeno, otpisano, otvoreno i prosječno trajanje.",
  grupa: "Servis",
  prava: [IZ, { modul: "servis", razina: "pregled" }],
  razdoblje: true,
  stupci: [
    { kljuc: "mjesec", naslov: "Mjesec", vrijednost: (r) => r["mjesec"], sort: Prisma.sql`mjesec` },
    { kljuc: "zaprimljeno", naslov: "Naloga", vrsta: "broj", vrijednost: (r) => r["zaprimljeno"], zbroj: true, sort: Prisma.sql`zaprimljeno` },
    { kljuc: "vraceno", naslov: STATUSI_SERVISA.VRACEN, vrsta: "broj", vrijednost: (r) => r["vraceno"], zbroj: true, sort: Prisma.sql`vraceno` },
    { kljuc: "otpisano", naslov: STATUSI_SERVISA.OTPISAN, vrsta: "broj", vrijednost: (r) => r["otpisano"], zbroj: true, sort: Prisma.sql`otpisano` },
    { kljuc: "otkazano", naslov: STATUSI_SERVISA.OTKAZAN, vrsta: "broj", vrijednost: (r) => r["otkazano"], zbroj: true, sort: Prisma.sql`otkazano` },
    { kljuc: "otvoreno", naslov: "Otvoreno", vrsta: "broj", vrijednost: (r) => r["otvoreno"], zbroj: true, sort: Prisma.sql`otvoreno` },
    { kljuc: "trajanje", naslov: "Prosječno trajanje (dana)", vrsta: "broj", vrijednost: (r) => r["trajanje"], sort: Prisma.sql`trajanje` },
  ],
  zadanoSortiranje: { kljuc: "mjesec", smjer: "desc" },
  async upit(db, firmaId, f, s) {
    const w = i([Prisma.sql`n."firmaId" = ${firmaId}::uuid`, ...uvjetDatuma(Prisma.sql`n.datum`, f.od, f.do)]);
    const polja = Prisma.sql`COUNT(*) AS zaprimljeno,
      COUNT(*) FILTER (WHERE n.status = 'VRACEN') AS vraceno, COUNT(*) FILTER (WHERE n.status = 'OTPISAN') AS otpisano,
      COUNT(*) FILTER (WHERE n.status = 'OTKAZAN') AS otkazano,
      COUNT(*) FILTER (WHERE n.status NOT IN ('VRACEN', 'OTPISAN', 'OTKAZAN')) AS otvoreno,
      ROUND(AVG(n.zatvoren - n.datum) FILTER (WHERE n.zatvoren IS NOT NULL), 1) AS trajanje`;
    const [redovi, [z]] = await Promise.all([
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT to_char(n.datum, 'YYYY-MM') AS mjesec, ${polja} FROM "ServisniNalog" n WHERE ${w} GROUP BY 1 ORDER BY ${s.sort}, 1 LIMIT ${s.take} OFFSET ${s.skip}`,
      db.$queryRaw<
        Record<string, unknown>[]
      >`SELECT COUNT(DISTINCT to_char(n.datum, 'YYYY-MM')) AS grupa, ${polja} FROM "ServisniNalog" n WHERE ${w}`,
    ]);
    const r = (x: Record<string, unknown>) => ({
      zaprimljeno: broj(x["zaprimljeno"]),
      vraceno: broj(x["vraceno"]),
      otpisano: broj(x["otpisano"]),
      otkazano: broj(x["otkazano"]),
      otvoreno: broj(x["otvoreno"]),
      trajanje: x["trajanje"] === null ? null : broj(x["trajanje"]),
    });
    return { redovi: redovi.map((x) => ({ mjesec: String(x["mjesec"]), ...r(x) })), ukupno: broj(z!["grupa"]), zbroj: r(z!) };
  },
};
