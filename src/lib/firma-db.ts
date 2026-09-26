import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Modeli koji pripadaju firmi (imaju `firmaId`). Svaki upit kroz `dbFirme`
 * nad ovim modelima automatski je ograničen na firmu.
 * Test `firma-db.test.ts` pukne ako model s `firmaId` u shemi nije na popisu.
 */
export const MODELI_S_FIRMOM = [
  "Brojac",
  "CijenaNajma",
  "Cjenik",
  "ClanstvoFirme",
  "Dnevnik",
  "DogadajUredaja",
  "EIzvjestaj",
  "ERacun",
  "Kategorija",
  "ModelUredaja",
  "Partner",
  "Poslovnica",
  "Prilog",
  "Primka",
  "ProdajniDokument",
  "Proizvodjac",
  "SkladisniDokument",
  "StavkaSkladisnogDokumenta",
  "Odobrenje",
  "Inventura",
  "MjesecNajma",
  "RataNajma",
  "UredajNaUgovoru",
  "StavkaInventure",
  "StavkaProdajnogDokumenta",
  "Sesija",
  "Skladiste",
  "SlanjeEposte",
  "StanjeRobe",
  "StavkaCjenika",
  "Uloga",
  "UgovorNajma",
  "Uplata",
  "Uredaj",
  "UredajNaStavci",
  "Usluga",
] as const;

/** Modeli s `firmaId` koji se namjerno NE ograničavaju (s razlogom). */
export const MODELI_S_FIRMOM_IZUZETI: Record<string, string> = {};

const S_FIRMOM = new Set<string>(MODELI_S_FIRMOM);

/**
 * Relacije globalnih modela (Korisnik, Firma) prema podacima više firmi. Kroz njih bi upit
 * iz jedne firme mogao dohvatiti tuđe podatke (npr. korisnik → sva njegova članstva), pa su
 * u upitima kroz dbFirme zabranjene. Test provjerava da je popis potpun.
 */
export const RELACIJE_PREMA_FIRMAMA: Record<string, readonly string[]> = {
  korisnik: ["clanstva", "sesije"],
  firma: [
    "clanstva",
    "sesije",
    "uloge",
    "dnevnik",
    "kategorije",
    "proizvodjaci",
    "modeli",
    "skladista",
    "stanjaRobe",
    "usluge",
    "partneri",
    "poslovnice",
    "cjenici",
    "stavkeCjenika",
    "uredaji",
    "dogadaji",
    "brojaci",
    "primke",
    "prilozi",
    "skladisniDokumenti",
    "stavkeDokumenata",
    "odobrenja",
    "inventure",
    "stavkeInventure",
    "prodajniDokumenti",
    "eRacuni",
    "eIzvjestaji",
    "ugovoriNajma",
    "planoviNajma",
    "cijeneNajma",
    "mjeseciNajma",
    "rateNajma",
    "stavkeProdaje",
    "uredajiNaStavkama",
    "uplate",
    "slanjaEposte",
  ],
};

/** Provjera include/select: ulaz u korisnika/firmu smije dohvatiti samo njihova obična polja. */
export function provjeriUgnijezdeno(model: string, args: Record<string, unknown>): void {
  const obidji = (cvor: unknown, put: string) => {
    if (!cvor || typeof cvor !== "object") return;
    for (const kljuc of ["include", "select"] as const) {
      const odabir = (cvor as Record<string, unknown>)[kljuc];
      if (!odabir || typeof odabir !== "object") continue;
      for (const [rel, vrijednost] of Object.entries(odabir as Record<string, unknown>)) {
        const zabranjene = RELACIJE_PREMA_FIRMAMA[rel];
        if (zabranjene && vrijednost && typeof vrijednost === "object") {
          const v = vrijednost as Record<string, unknown>;
          if (v["include"]) throw new Error(`${model}: ${put}${rel} ne smije uključivati relacije (dbFirme).`);
          const sel = v["select"] as Record<string, unknown> | undefined;
          for (const polje of Object.keys(sel ?? {})) {
            if (zabranjene.includes(polje) || polje === "_count")
              throw new Error(`${model}: ${put}${rel}.${polje} vodi do podataka drugih firmi (dbFirme).`);
          }
        }
        obidji(vrijednost, `${put}${rel}.`);
      }
    }
  };
  obidji(args, "");
}

/** Ugniježđeni novi zapisi (create unutar data) moraju nositi firmaId ove firme. */
export function provjeriUgnijezdenoPisanje(model: string, data: unknown, firmaId: string): void {
  const provjeriNovi = (zapis: unknown) => {
    for (const z of Array.isArray(zapis) ? zapis : [zapis]) {
      if (!z || typeof z !== "object") continue;
      if ((z as Record<string, unknown>)["firmaId"] !== firmaId)
        throw new Error(`${model}: ugniježđeni novi zapis mora imati firmaId ove firme (dbFirme).`);
      obidji(z);
    }
  };
  const obidji = (cvor: unknown) => {
    if (!cvor || typeof cvor !== "object" || Array.isArray(cvor)) return;
    for (const v of Object.values(cvor as Record<string, unknown>)) {
      if (!v || typeof v !== "object" || Array.isArray(v) || v instanceof Date) continue;
      const o = v as Record<string, unknown>;
      if ("create" in o) provjeriNovi(o["create"]);
      if ("createMany" in o) provjeriNovi((o["createMany"] as { data?: unknown })?.data);
      if ("connectOrCreate" in o) for (const c of [o["connectOrCreate"]].flat()) provjeriNovi((c as { create?: unknown })?.create);
      if ("upsert" in o) for (const u of [o["upsert"]].flat()) provjeriNovi((u as { create?: unknown })?.create);
    }
  };
  for (const z of Array.isArray(data) ? data : [data]) obidji(z);
}

const S_WHERE = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

const JEDINSTVENI = new Set(["findUnique", "findUniqueOrThrow", "update", "delete"]);

type Argumenti = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

/**
 * Pravila ograničenja na firmu — čista funkcija nad argumentima Prisma upita.
 * Baca grešku za pokušaj pisanja u drugu firmu ili premještanja zapisa među firmama.
 */
export function ogranicniNaFirmu(model: string, operacija: string, args: Argumenti, firmaId: string): Argumenti {
  if (!S_FIRMOM.has(model)) return args;
  provjeriUgnijezdeno(model, args as Record<string, unknown>);
  if (args.data) provjeriUgnijezdenoPisanje(model, args.data, firmaId);
  if (args.create) provjeriUgnijezdenoPisanje(model, args.create, firmaId);
  if (args.update) provjeriUgnijezdenoPisanje(model, args.update, firmaId);
  const a: Argumenti = { ...args };

  const provjeriPodatke = (podaci: Record<string, unknown> | undefined, stvaranje: boolean) => {
    if (!podaci) return podaci;
    if ("firma" in podaci) throw new Error(`${model}: koristite firmaId, ne vezu „firma“ (ograničenje na firmu).`);
    if ("firmaId" in podaci && podaci["firmaId"] !== firmaId) {
      throw new Error(`${model}: zapis ne smije pripadati drugoj firmi.`);
    }
    return stvaranje ? { ...podaci, firmaId } : podaci;
  };

  if (S_WHERE.has(operacija)) {
    // upiti po jedinstvenom ključu moraju imati ključ na vrhu; ostali dobiju AND,
    // pa traženje tuđe firme daje prazan rezultat umjesto vlastitih zapisa
    a.where = JEDINSTVENI.has(operacija) ? { ...(args.where ?? {}), firmaId } : { AND: [args.where ?? {}, { firmaId }] };
    if (operacija.startsWith("update") && a.data && !Array.isArray(a.data)) a.data = provjeriPodatke(a.data, false);
    return a;
  }

  switch (operacija) {
    case "create":
      if (Array.isArray(a.data)) throw new Error("create očekuje jedan zapis");
      a.data = provjeriPodatke(a.data, true);
      return a;
    case "createMany":
    case "createManyAndReturn": {
      const niz = Array.isArray(a.data) ? a.data : a.data ? [a.data] : [];
      a.data = niz.map((d) => provjeriPodatke(d, true)!);
      return a;
    }
    case "upsert":
      a.where = { ...(args.where ?? {}), firmaId };
      a.create = provjeriPodatke(a.create, true);
      a.update = provjeriPodatke(a.update, false);
      return a;
    default:
      throw new Error(`${model}.${operacija}: operacija nije podržana kroz dbFirme.`);
  }
}

/** Klijent baze ograničen na jednu firmu. Program nad podacima firme radi SAMO kroz ovo. */
export function sFirmom(klijent: PrismaClient, firmaId: string) {
  if (!firmaId) throw new Error("dbFirme: firmaId je obavezan.");
  return klijent.$extends({
    name: "firma",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(ogranicniNaFirmu(model, operation, args as Argumenti, firmaId) as typeof args);
        },
      },
    },
  });
}

export type DbFirme = ReturnType<typeof sFirmom>;
