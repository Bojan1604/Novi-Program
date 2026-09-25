/**
 * Demo podaci. Pokreće se na praznoj bazi (npm run test:seed, i u CI-u pri svakoj promjeni).
 * Svaki korak koji doda model dodaje i demo podatke koji poštuju sva pravila
 * (valjani OIB-i, kronološki datumi, iznosi u centima).
 */
import { napraviPrismu } from "../src/lib/prisma";

async function glavno(): Promise<void> {
  const prisma = napraviPrismu();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Demo podaci: baza je dostupna; još nema poslovnih modela (korak 0.1).");
  } finally {
    await prisma.$disconnect();
  }
}

glavno().catch((greska: unknown) => {
  console.error("Demo podaci nisu učitani:", greska);
  process.exit(1);
});
