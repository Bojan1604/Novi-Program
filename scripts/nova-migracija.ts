/**
 * npm run db:migrate -- <ime_migracije>
 * Nova migracija iz razlike između razvojne baze (s primijenjenim migracijama) i sheme.
 * Radi bez interaktivnog terminala (za razliku od `prisma migrate dev`), ispiše SQL na pregled,
 * primijeni ga i generira Prisma klijent. Migracije smiju samo dodavati — SQL s DROP COLUMN/TABLE se odbija.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const ime = process.argv[2];
if (!ime || !/^[a-z0-9_]+$/.test(ime)) {
  console.error("Upotreba: npm run db:migrate -- ime_migracije   (mala slova, brojevi, _)");
  process.exit(1);
}

execSync("npx prisma migrate deploy", { stdio: "inherit" });
const sql = execSync("npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script", { encoding: "utf8" });
if (!sql.trim() || /^-- This is an empty migration/m.test(sql)) {
  console.log("Nema promjena u shemi.");
  process.exit(0);
}
if (/DROP (COLUMN|TABLE)/i.test(sql) && !process.argv.includes("--dopusti-brisanje")) {
  console.error(sql);
  console.error("\n✘ Migracija briše stupce ili tablice. Migracije samo dodaju (pravilo projekta).");
  process.exit(1);
}
const vrijeme = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const mapa = `prisma/migrations/${vrijeme}_${ime}`;
mkdirSync(mapa, { recursive: true });
writeFileSync(`${mapa}/migration.sql`, sql);
console.log(sql);
execSync("npx prisma migrate deploy && npx prisma generate", { stdio: "inherit" });
console.log(`\n✔ ${mapa}`);
