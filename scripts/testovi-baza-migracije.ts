import "dotenv/config";
import { execSync } from "node:child_process";
import { adresaTestneBaze } from "./lib/testna-baza";

/** Vitest globalSetup za test:db — testna baza uvijek ima sve migracije (ništa se ne briše). */
export default function primijeniMigracije(): void {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: adresaTestneBaze() },
  });
}
