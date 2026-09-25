import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import "dotenv/config";
import { adresaTestneBaze } from "../scripts/lib/testna-baza";
import { napraviPrismu } from "../src/lib/prisma";
import { napraviZadaneUloge } from "../src/services/korisnici";
import { napraviZadaneSifrarnike } from "../src/services/sifrarnici";
import { ocistiBazu } from "../src/test/baza";
import { E2E } from "./podaci";

/** Testna baza s migracijama i poznatim korisnicima za testove u pregledniku (pokreće e2e/priprema.ts). */
async function priprema(): Promise<void> {
  const url = adresaTestneBaze();
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  process.env["DATABASE_URL"] = url;
  const prisma = napraviPrismu(url);
  try {
    await ocistiBazu(prisma);
    const firma = await prisma.firma.create({ data: { naziv: E2E.firma, oib: "69435151530", boja: E2E.boja } });
    const uloge = await napraviZadaneUloge(prisma, firma.id);
    await napraviZadaneSifrarnike(prisma, firma.id);
    const lozinkaHash = bcrypt.hashSync(E2E.admin.lozinka, 4);
    for (const k of [
      { ime: E2E.admin.ime, email: E2E.admin.email, uloga: "Administrator" },
      { ime: E2E.prodavac.ime, email: E2E.prodavac.email, uloga: "Prodavač" },
      { ime: "Zaključani", email: E2E.zakljucavanje.email, uloga: "Prodavač" },
    ]) {
      const korisnik = await prisma.korisnik.create({ data: { ime: k.ime, email: k.email, lozinkaHash } });
      await prisma.clanstvoFirme.create({ data: { firmaId: firma.id, korisnikId: korisnik.id, ulogaId: uloge[k.uloga]! } });
    }
  } finally {
    await prisma.$disconnect();
  }
}

priprema().catch((greska: unknown) => {
  console.error(greska);
  process.exit(1);
});
