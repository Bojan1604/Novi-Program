/**
 * npm run db:velika — puni PRAZNU bazu velikom količinom podataka za mjerenje brzine
 * (300.000 uređaja, 100.000 računa, 3.000 ugovora…). Isti kod kao demo podaci.
 *
 *   DATABASE_URL=postgresql://…/erp_wms_velika npm run db:velika
 *   npm run db:velika -- --uredaja 50000    (manje, za brzu provjeru)
 *
 * Odbija bazu koja nije prazna ili kojoj ime ne sadrži „velika“ ili „test“.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { DEMO_KOLICINE, napuniDemo, VELIKA_KOLICINE, type Kolicine } from "../prisma/demo";
import { napraviPrismu } from "../src/lib/prisma";

function argument(ime: string): number | undefined {
  const i = process.argv.indexOf(`--${ime}`);
  if (i < 0) return undefined;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${ime} mora biti cijeli broj.`);
  return n;
}

async function glavno(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  const ime = new URL(url).pathname.slice(1);
  if (!/velika|test/i.test(ime)) throw new Error(`Velika baza puni se samo u bazu s „velika“ ili „test“ u imenu (dobiveno „${ime}“).`);
  execSync("npx prisma migrate deploy", { stdio: "inherit" });

  const kolicine: Kolicine = {
    uredaja: argument("uredaja") ?? VELIKA_KOLICINE.uredaja,
    partnera: argument("partnera") ?? VELIKA_KOLICINE.partnera,
    racuna: argument("racuna") ?? VELIKA_KOLICINE.racuna,
    ugovora: argument("ugovora") ?? VELIKA_KOLICINE.ugovora,
  };
  if (process.argv.includes("--demo")) Object.assign(kolicine, DEMO_KOLICINE);
  console.log(`Punim bazu „${ime}“:`, kolicine);
  const prisma = napraviPrismu(url);
  const pocetak = Date.now();
  try {
    await napuniDemo(prisma, kolicine);
  } finally {
    await prisma.$disconnect();
  }
  console.log(`✔ Gotovo za ${((Date.now() - pocetak) / 1000).toFixed(0)} s. Prijava: admin@demo.hr / Demo-lozinka-2026`);
}

glavno().catch((e: unknown) => {
  console.error(`✘ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
