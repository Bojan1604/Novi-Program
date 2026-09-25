import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Modeli koji pripadaju firmi (imaju `firmaId`). Svaki upit kroz `dbFirme`
 * nad ovim modelima automatski je ograničen na firmu.
 * Test `firma-db.test.ts` pukne ako model s `firmaId` u shemi nije na popisu.
 */
export const MODELI_S_FIRMOM = ["ClanstvoFirme", "Sesija", "Uloga"] as const;

/** Modeli s `firmaId` koji se namjerno NE ograničavaju (s razlogom). */
export const MODELI_S_FIRMOM_IZUZETI: Record<string, string> = {};

const S_FIRMOM = new Set<string>(MODELI_S_FIRMOM);

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
