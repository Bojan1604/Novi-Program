/**
 * Demo podaci. Pokreće se na praznoj bazi (npm run test:seed, i u CI-u pri svakoj promjeni).
 * Podaci poštuju sva pravila (valjani OIB-i, kronološki datumi, iznosi u centima).
 *
 * Prijava: admin@demo.hr / Demo-lozinka-2026 (i voditelj@, prodavac@, skladistar@, serviser@, knjigovodja@demo.hr)
 */
import { napraviPrismu } from "../src/lib/prisma";
import { napuniDemo } from "./demo";
import { DEMO_LOZINKA } from "./demo/firme";

async function glavno(): Promise<void> {
  const prisma = napraviPrismu();
  try {
    await napuniDemo(prisma);
    console.log(`Demo podaci učitani. Prijava: admin@demo.hr / ${DEMO_LOZINKA}`);
  } finally {
    await prisma.$disconnect();
  }
}

glavno().catch((greska: unknown) => {
  console.error("Demo podaci nisu učitani:", greska);
  process.exit(1);
});
