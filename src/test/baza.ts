/**
 * Pomoć za testove nad bazom (samo testna baza — vidi scripts/testovi-baza-priprema.ts).
 */
import bcrypt from "bcryptjs";
import { kontrolnaZnamenkaOib } from "@/domain/oib";
import type { PrismaClient } from "@/generated/prisma/client";
import { napraviPrismu } from "@/lib/prisma";
import { napraviZadaneUloge } from "@/services/korisnici";

export function testnaPrisma(): PrismaClient {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!/test/i.test(new URL(url).pathname)) throw new Error("Testovi smiju raditi samo nad testnom bazom.");
  return napraviPrismu(url);
}

/** Prazni sve tablice testne baze (osim evidencije migracija). */
export async function ocistiBazu(prisma: PrismaClient): Promise<void> {
  const tablice = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tablice.length === 0) return;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablice.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let brojac = 0;
export function testniOib(): string {
  brojac++;
  const prvih10 = String(1_000_000_000 + (((Date.now() % 1_000_000) * 1000 + brojac) % 8_999_999_999)).slice(0, 10);
  return prvih10 + kontrolnaZnamenkaOib(prvih10);
}

export const TESTNA_LOZINKA = "Testna-lozinka-1";
let testniHash: string | null = null;
function hashTestneLozinke(): string {
  // manji cost samo u testovima — brži testovi, isto ponašanje
  testniHash ??= bcrypt.hashSync(TESTNA_LOZINKA, 4);
  return testniHash;
}

/** Firma sa zadanim ulogama; `uloge` su id-evi po nazivu. */
export async function napraviFirmu(prisma: PrismaClient, naziv = "Firma d.o.o.") {
  const firma = await prisma.firma.create({ data: { naziv, oib: testniOib() } });
  const uloge = await napraviZadaneUloge(prisma, firma.id);
  return { ...firma, uloge };
}

export async function napraviKorisnika(
  prisma: PrismaClient,
  firmaId: string,
  podaci: { email?: string; ime?: string; aktivan?: boolean; uloga?: string } = {},
) {
  brojac++;
  const korisnik = await prisma.korisnik.create({
    data: {
      ime: podaci.ime ?? "Test Korisnik",
      email: podaci.email ?? `korisnik${brojac}-${Date.now()}@test.hr`,
      lozinkaHash: hashTestneLozinke(),
      aktivan: podaci.aktivan ?? true,
    },
  });
  const uloga = await prisma.uloga.findFirstOrThrow({ where: { firmaId, naziv: podaci.uloga ?? "Administrator" } });
  await prisma.clanstvoFirme.create({ data: { firmaId, korisnikId: korisnik.id, ulogaId: uloga.id } });
  return korisnik;
}
