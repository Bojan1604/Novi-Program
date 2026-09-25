/**
 * Demo podaci. Pokreće se na praznoj bazi (npm run test:seed, i u CI-u pri svakoj promjeni).
 * Svaki korak koji doda model dodaje i demo podatke koji poštuju sva pravila
 * (valjani OIB-i, kronološki datumi, iznosi u centima).
 *
 * Prijava u demo: demo@erp-wms.hr / Demo-lozinka-2026
 */
import { napraviPrismu } from "../src/lib/prisma";
import { hashLozinke } from "../src/services/prijava";

export const DEMO = {
  firma: { naziv: "Demo Informatika d.o.o.", oib: "69435151530" },
  admin: { ime: "Demo Administrator", email: "demo@erp-wms.hr", lozinka: "Demo-lozinka-2026" },
};

async function glavno(): Promise<void> {
  const prisma = napraviPrismu();
  try {
    if ((await prisma.korisnik.count()) > 0) throw new Error("Demo podaci se učitavaju samo u praznu bazu.");
    const firma = await prisma.firma.create({ data: DEMO.firma });
    const admin = await prisma.korisnik.create({
      data: { ime: DEMO.admin.ime, email: DEMO.admin.email, lozinkaHash: await hashLozinke(DEMO.admin.lozinka) },
    });
    await prisma.clanstvoFirme.create({ data: { firmaId: firma.id, korisnikId: admin.id } });
    console.log(`Demo podaci: firma „${firma.naziv}“, prijava ${DEMO.admin.email} / ${DEMO.admin.lozinka}`);
  } finally {
    await prisma.$disconnect();
  }
}

glavno().catch((greska: unknown) => {
  console.error("Demo podaci nisu učitani:", greska);
  process.exit(1);
});
