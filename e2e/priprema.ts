import { execSync } from "node:child_process";

/** Playwright globalSetup: priprema testne baze u zasebnom procesu (tsx razumije Prisma ESM klijent). */
export default function priprema(): void {
  execSync("npx tsx e2e/priprema-baze.ts", { stdio: "inherit" });
}
