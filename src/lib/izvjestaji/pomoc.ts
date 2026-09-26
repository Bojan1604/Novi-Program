import { Prisma } from "@/generated/prisma/client";
import { centiIzDecimala } from "@/domain/novac";

/** Decimal/number/bigint iz SQL-a → centi ili broj. */
export const centi = (x: unknown): number =>
  x === null || x === undefined ? 0 : centiIzDecimala((x as Prisma.Decimal).toFixed?.(2) ?? Number(x).toFixed(2));
export const broj = (x: unknown): number => (x === null || x === undefined ? 0 : Number(x));

export const uvjetDatuma = (stupac: Prisma.Sql, od: string | null, doD: string | null): Prisma.Sql[] => [
  ...(od ? [Prisma.sql`${stupac} >= ${od}::date`] : []),
  ...(doD ? [Prisma.sql`${stupac} <= ${doD}::date`] : []),
];

export const i = (uvjeti: Prisma.Sql[]) => (uvjeti.length ? Prisma.join(uvjeti, " AND ") : Prisma.sql`TRUE`);

export const uuidovi = (l: string[]) => l.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
