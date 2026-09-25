/**
 * npm run test:seed — demo podaci u praznu bazu.
 *
 * Na poslužitelju testne baze napravi NOVU privremenu bazu (uvijek prazna),
 * primijeni sve migracije, učita demo podatke i na kraju ukloni samo tu
 * privremenu bazu. Postojeće baze se ne diraju.
 * Pukne (izlaz ≠ 0) ako bilo koji korak ne uspije; isto se pokreće u CI-u.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { adresaTestneBaze } from "./lib/testna-baza";

async function glavno(): Promise<void> {
  const adresaTestne = adresaTestneBaze();
  const imeBaze = `erp_wms_test_demo_${Date.now()}`;
  const adresaPrivremene = new URL(adresaTestne);
  adresaPrivremene.pathname = `/${imeBaze}`;

  const admin = new Client({ connectionString: adresaTestne });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${imeBaze}"`);
    console.log(`▶ Privremena prazna baza: ${imeBaze}`);
    try {
      const env = { ...process.env, DATABASE_URL: adresaPrivremene.toString() };
      console.log("\n▶ Migracije");
      execSync("npx prisma migrate deploy", { stdio: "inherit", env });
      console.log("\n▶ Demo podaci");
      execSync("npx prisma db seed", { stdio: "inherit", env });
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS "${imeBaze}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
  console.log("\n✔ Demo podaci učitani u praznu bazu.");
}

glavno().catch((greska: unknown) => {
  console.error("\n✘ Demo podaci nisu učitani:", greska instanceof Error ? greska.message : greska);
  process.exit(1);
});
