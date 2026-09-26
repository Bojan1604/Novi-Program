import type { Prisma } from "@/generated/prisma/client";
import { dodajDane, jeDatum } from "@/domain/datum";
import { maskiraj, procitajPromjene } from "@/domain/dnevnik";
import { jeUuid } from "@/domain/id";
import { dopustenaPolja, mozeSeObrisati } from "@/domain/kartica-uredaja";
import { VRSTE_DOKUMENATA, type VrstaDokumenta } from "@/domain/skladisni-dokumenti";
import { centiIzDecimala } from "@/domain/novac";
import type { Sortiranje } from "@/domain/popis";
import { normalizirajSerijski, POPIS_STANJA, type Stanje } from "@/domain/stanja-uredaja";
import type { SortiranjeUredaja } from "@/domain/stupci-uredaja";
import type { DbFirme } from "@/lib/firma-db";

export type FilterUredaja = {
  trazi?: string;
  stanje: string[];
  skladiste: string[];
  kategorija: string[];
  proizvodjac: string[];
  partnerId?: string;
  primkaId?: string;
  /** točni serijski brojevi (skupno skeniranje), najviše 500 */
  serijski?: string[];
  /** zaprimljeni od–do (YYYY-MM-DD) */
  od?: string;
  do?: string;
  /** jamstvo istječe do (YYYY-MM-DD) */
  jamstvoDo?: string;
  sort: Sortiranje<SortiranjeUredaja>;
  stranica: number;
  velicina: number;
};

const d = (x: string) => new Date(`${x}T00:00:00Z`);

/**
 * Uvjet popisa. `modeliPoNazivu` = id-evi modela čiji naziv odgovara pretrazi (vidi `modeliZaPretragu`) —
 * izravni uvjet na modelId je brži od spajanja tablica na 300.000 uređaja.
 */
export function uvjetUredaja(
  firmaId: string,
  f: Omit<FilterUredaja, "sort" | "stranica" | "velicina">,
  modeliPoNazivu: string[] = [],
): Prisma.UredajWhereInput {
  const i: Prisma.UredajWhereInput[] = [];
  const t = f.trazi?.trim();
  if (t) {
    const veliko = t.toUpperCase().replace(/\s+/g, "");
    // serijski je spremljen velikim slovima → LIKE koristi trigramski indeks
    i.push({ OR: [{ serijski: { contains: veliko } }, ...(modeliPoNazivu.length ? [{ modelId: { in: modeliPoNazivu } }] : [])] });
  }
  const stanja = f.stanje.filter((s): s is Stanje => (POPIS_STANJA as string[]).includes(s));
  if (stanja.length) i.push({ stanje: { in: stanja } });
  const uuid = (l: string[]) => l.filter(jeUuid);
  if (uuid(f.skladiste).length) i.push({ skladisteId: { in: uuid(f.skladiste) } });
  if (uuid(f.kategorija).length) i.push({ model: { kategorijaId: { in: uuid(f.kategorija) } } });
  if (uuid(f.proizvodjac).length) i.push({ model: { proizvodjacId: { in: uuid(f.proizvodjac) } } });
  if (f.partnerId && jeUuid(f.partnerId)) i.push({ partnerId: f.partnerId });
  if (f.primkaId && jeUuid(f.primkaId)) i.push({ primkaId: f.primkaId });
  if (f.serijski?.length) i.push({ serijski: { in: f.serijski.slice(0, 500).map((x) => normalizirajSerijski(x)) } });
  if (jeDatum(f.od)) i.push({ nabavniDatum: { gte: d(f.od) } });
  if (jeDatum(f.do) && f.do < "2999-12-31") i.push({ nabavniDatum: { lt: d(dodajDane(f.do, 1)) } });
  if (jeDatum(f.jamstvoDo)) i.push({ jamstvoDo: { lte: d(f.jamstvoDo) } });
  return i.length ? { firmaId, AND: i } : { firmaId };
}

/** Modeli čiji naziv (ili proizvođač) sadrži tekst pretrage — mala tablica, jedan brzi upit. */
export async function modeliZaPretragu(db: DbFirme, firmaId: string, trazi: string | undefined): Promise<string[]> {
  const t = trazi?.trim();
  if (!t) return [];
  const m = await db.modelUredaja.findMany({
    where: { firmaId, OR: [{ naziv: { contains: t, mode: "insensitive" } }, { proizvodjac: { naziv: { contains: t, mode: "insensitive" } } }] },
    select: { id: true },
    take: 500,
  });
  return m.map((x) => x.id);
}

export async function popisUredaja(db: DbFirme, firmaId: string, f: FilterUredaja, vidiNabavne: boolean) {
  const where = uvjetUredaja(firmaId, f, await modeliZaPretragu(db, firmaId, f.trazi));
  const sort = f.sort.kljuc === "nabavnaCijena" && !vidiNabavne ? { kljuc: "stvoreno" as const, smjer: "desc" as const } : f.sort;
  const orderBy: Prisma.UredajOrderByWithRelationInput[] = [
    sort.kljuc === "nabavnaCijena" || sort.kljuc === "nabavniDatum" || sort.kljuc === "jamstvoDo"
      ? { [sort.kljuc]: { sort: sort.smjer, nulls: "last" } }
      : { [sort.kljuc]: sort.smjer },
    { id: sort.smjer },
  ];
  const [ukupno, redovi, poStanju, zbroj] = await Promise.all([
    db.uredaj.count({ where }),
    db.uredaj.findMany({
      where,
      orderBy,
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
      select: {
        id: true,
        serijski: true,
        stanje: true,
        nabavnaCijena: true,
        nabavniDatum: true,
        jamstvoDo: true,
        cpu: true,
        ram: true,
        disk: true,
        ekran: true,
        os: true,
        napomena: true,
        model: { select: { naziv: true, proizvodjac: { select: { naziv: true } }, kategorija: { select: { naziv: true } } } },
        skladiste: { select: { naziv: true } },
        partner: { select: { id: true, naziv: true } },
        stanjeRobe: { select: { naziv: true } },
        primka: { select: { id: true, broj: true } },
      },
    }),
    db.uredaj.groupBy({ by: ["stanje"], where, _count: true }),
    vidiNabavne ? db.uredaj.aggregate({ where, _sum: { nabavnaCijena: true } }) : Promise.resolve(null),
  ]);
  return {
    ukupno,
    poStanju: Object.fromEntries(poStanju.map((g) => [g.stanje, g._count])) as Partial<Record<Stanje, number>>,
    // nabavne vrijednosti samo s pravom — inače se uopće ne čitaju iz baze za prikaz
    zbrojNabavno: zbroj?._sum.nabavnaCijena ? centiIzDecimala(zbroj._sum.nabavnaCijena.toString()) : null,
    redovi: redovi.map((u) => ({ ...u, nabavnaCijena: vidiNabavne && u.nabavnaCijena ? centiIzDecimala(u.nabavnaCijena.toString()) : null })),
  };
}

export async function opcijeFiltaraUredaja(db: DbFirme, firmaId: string) {
  const [skladista, kategorije, proizvodjaci] = await Promise.all([
    db.skladiste.findMany({ where: { firmaId }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true } }),
    db.kategorija.findMany({ where: { firmaId }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true } }),
    db.proizvodjac.findMany({ where: { firmaId }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true } }),
  ]);
  const o = (l: { id: string; naziv: string }[]) => l.map((x) => ({ vrijednost: x.id, naziv: x.naziv }));
  return { skladista: o(skladista), kategorije: o(kategorije), proizvodjaci: o(proizvodjaci) };
}

export const NAJVISE_DOGADAJA_NA_KARTICI = 500;

/**
 * Kartica uređaja: podaci, povijest, prilozi (bez sadržaja), ispravci iz dnevnika i što se smije mijenjati.
 * Nabavna cijena se bez prava uopće ne vraća (ni u povijesti ispravaka — maskirano ovdje).
 */
export async function karticaUredaja(db: DbFirme, firmaId: string, id: string, vidiNabavne: boolean) {
  if (!jeUuid(id)) return null;
  const u = await db.uredaj.findFirst({
    where: { firmaId, id },
    include: {
      model: {
        select: { id: true, naziv: true, jamstvoMjeseci: true, proizvodjac: { select: { naziv: true } }, kategorija: { select: { naziv: true } } },
      },
      skladiste: { select: { naziv: true } },
      stanjeRobe: { select: { id: true, naziv: true } },
      partner: { select: { id: true, naziv: true } },
      poslovnica: { select: { naziv: true } },
      primka: { select: { id: true, broj: true, status: true } },
    },
  });
  if (!u) return null;
  const [dogadaji, ukupnoDogadaja, prilozi, ispravci, stanjaRobe] = await Promise.all([
    db.dogadajUredaja.findMany({
      where: { firmaId, uredajId: id },
      orderBy: [{ vrijeme: "desc" }, { id: "desc" }],
      take: NAJVISE_DOGADAJA_NA_KARTICI,
    }),
    db.dogadajUredaja.count({ where: { firmaId, uredajId: id } }),
    db.prilog.findMany({
      where: { firmaId, entitet: "Uredaj", entitetId: id },
      orderBy: { stvoreno: "desc" },
      select: { id: true, naziv: true, vrsta: true, velicina: true, korisnik: true, stvoreno: true },
    }),
    db.dnevnik.findMany({
      where: { firmaId, entitet: "Uredaj", entitetId: id },
      orderBy: [{ vrijeme: "desc" }, { id: "desc" }],
      take: 100,
      select: { id: true, vrijeme: true, korisnik: true, radnja: true, opis: true, promjene: true },
    }),
    db.stanjeRobe.findMany({ where: { firmaId }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true, aktivan: true } }),
  ]);
  // nazivi skladišta i partnera iz povijesti (jedan upit za sve)
  const skladistaIds = [...new Set(dogadaji.flatMap((d) => [d.skladisteOdId, d.skladisteDoId]).filter((x): x is string => !!x))];
  const partneriIds = [...new Set(dogadaji.map((d) => d.partnerId).filter((x): x is string => !!x))];
  const [skladista, partneri] = await Promise.all([
    skladistaIds.length ? db.skladiste.findMany({ where: { firmaId, id: { in: skladistaIds } }, select: { id: true, naziv: true } }) : [],
    partneriIds.length ? db.partner.findMany({ where: { firmaId, id: { in: partneriIds } }, select: { id: true, naziv: true } }) : [],
  ]);
  const nazivSkladista = new Map(skladista.map((x) => [x.id, x.naziv]));
  const nazivPartnera = new Map(partneri.map((x) => [x.id, x.naziv]));

  const [stavkeDok, stavkeInv] = await Promise.all([
    db.stavkaSkladisnogDokumenta.findMany({
      where: { firmaId, uredajId: id },
      select: { dokument: { select: { vrsta: true, broj: true } } },
      take: 100,
    }),
    db.stavkaInventure.findMany({ where: { firmaId, uredajId: id }, select: { inventura: { select: { broj: true } } }, take: 100 }),
  ]);
  const veze = {
    primka: u.primka?.broj ?? null,
    dokumenti: [
      ...dogadaji.filter((d) => d.dokumentVrsta).map((d) => ({ vrsta: d.dokumentVrsta!, broj: d.dokumentBroj })),
      ...stavkeDok.map((x) => ({ vrsta: VRSTE_DOKUMENATA[x.dokument.vrsta as VrstaDokumenta]?.naziv ?? x.dokument.vrsta, broj: x.dokument.broj })),
      ...stavkeInv.map((x) => ({ vrsta: "Inventura", broj: x.inventura.broj })),
    ],
  };
  const { polja, zakljucano } = dopustenaPolja(veze, vidiNabavne);
  const brisanje = mozeSeObrisati(veze);
  return {
    ...u,
    nabavnaCijena: vidiNabavne && u.nabavnaCijena !== null ? centiIzDecimala(u.nabavnaCijena.toString()) : null,
    dogadaji: dogadaji.map((d) => ({
      id: d.id,
      vrijeme: d.vrijeme,
      radnja: d.radnja,
      staroStanje: d.staroStanje,
      novoStanje: d.novoStanje,
      skladisteOd: d.skladisteOdId ? (nazivSkladista.get(d.skladisteOdId) ?? null) : null,
      skladisteDo: d.skladisteDoId ? (nazivSkladista.get(d.skladisteDoId) ?? null) : null,
      partner: d.partnerId ? { id: d.partnerId, naziv: nazivPartnera.get(d.partnerId) ?? "" } : null,
      dokumentVrsta: d.dokumentVrsta,
      dokumentId: d.dokumentId,
      dokumentBroj: d.dokumentBroj,
      opis: d.opis,
      korisnik: d.korisnik,
    })),
    ukupnoDogadaja,
    prilozi,
    ispravci: ispravci.map((z) => ({ ...z, promjene: maskiraj(procitajPromjene(z.promjene), vidiNabavne) })),
    stanjaRobe,
    dopusteno: [...polja],
    zakljucano,
    brisanje: brisanje.ok ? null : brisanje.razlog,
  };
}

/** Uređaji po točnim serijskim brojevima (skeniranje) — bez nabavnih podataka. */
export async function uredajiPoSerijskim(db: DbFirme, firmaId: string, serijski: string[]) {
  const lista = [...new Set(serijski.map(normalizirajSerijski).filter(Boolean))].slice(0, 500);
  if (lista.length === 0) return [];
  return db.uredaj.findMany({
    where: { firmaId, serijski: { in: lista } },
    select: {
      id: true,
      serijski: true,
      stanje: true,
      model: { select: { naziv: true, proizvodjac: { select: { naziv: true } } } },
      skladiste: { select: { naziv: true } },
      partner: { select: { naziv: true } },
    },
  });
}
