import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { PotrebnoPravo } from "@/lib/akcije-prava";
import type { StupacIzvoza } from "@/lib/izvoz/stupci";

/**
 * Okvir izvještaja (korak 6.1): svaki izvještaj je SQL grupiranje s filtrima, stranicama,
 * sortiranjem po dopuštenim stupcima i zbrojem cijelog skupa iz baze (ne samo stranice).
 */
export type Redak = Record<string, string | number | null>;

export type StupacIzvjestaja = StupacIzvoza<Redak> & {
  kljuc: string;
  /** zbroj se računa u bazi za cijeli filtrirani skup */
  zbroj?: boolean;
  /** SQL izraz za sortiranje (samo dopušteni stupci) */
  sort?: Prisma.Sql;
  veza?: (r: Redak) => string | null;
};

export type FiltriUpita = {
  od: string | null;
  do: string | null;
  trazi: string | null;
  vise: Record<string, string[]>;
};

export type StranicaUpita = { skip: number; take: number; sort: Prisma.Sql };

export type RezultatIzvjestaja = { redovi: Redak[]; ukupno: number; zbroj: Redak };

export type FilterVise = {
  kljuc: string;
  oznaka: string;
  opcije: (db: PrismaClient, firmaId: string) => Promise<{ vrijednost: string; naziv: string }[]>;
};

export type Izvjestaj = {
  kljuc: string;
  naziv: string;
  opis: string;
  grupa: string;
  /** sva navedena prava moraju biti zadovoljena (uz modul „izvještaji“) */
  prava: PotrebnoPravo[];
  razdoblje: boolean;
  trazi?: string;
  vise?: FilterVise[];
  stupci: StupacIzvjestaja[];
  zadanoSortiranje: { kljuc: string; smjer: "asc" | "desc" };
  upit: (db: PrismaClient, firmaId: string, f: FiltriUpita, s: StranicaUpita) => Promise<RezultatIzvjestaja>;
};
