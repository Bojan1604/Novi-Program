import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Novi klijent za zadanu bazu (skripte i testovi). Program koristi `db` iz ./db. */
export function napraviPrismu(url = process.env["DATABASE_URL"]): PrismaClient {
  if (!url) throw new Error("DATABASE_URL nije postavljen (pogledajte .env.example).");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
