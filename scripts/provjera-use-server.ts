/**
 * Pregledava sve .ts/.tsx datoteke u src/ i javlja 'use server' datoteke
 * koje izvoze nešto osim async funkcija, akcije koje ne provjeravaju prava (ili nešto rade prije
 * provjere), 'use server' unutar funkcija, te stranice i API rute bez provjere pristupa.
 *
 * Pokretanje: npm run check:use-server
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { provjeriPristupStranice, provjeriUnutarnjiUseServer, provjeriUseServer, provjeriZastituAkcija } from "./lib/use-server";

function* datoteke(mapa: string): Generator<string> {
  for (const ime of readdirSync(mapa)) {
    if (ime === "node_modules" || ime === "generated" || ime.startsWith(".")) continue;
    const put = join(mapa, ime);
    if (statSync(put).isDirectory()) yield* datoteke(put);
    else if (/\.(ts|tsx)$/.test(ime) && !/\.test\.tsx?$/.test(ime)) yield put;
  }
}

function glavno(): void {
  const korijen = process.cwd();
  const greske: string[] = [];
  let pregledano = 0;
  for (const put of datoteke(join(korijen, "src"))) {
    pregledano++;
    const tekst = readFileSync(put, "utf8");
    const rel = relative(korijen, put);
    greske.push(...provjeriUseServer(tekst, rel), ...provjeriZastituAkcija(tekst, rel), ...provjeriUnutarnjiUseServer(tekst, rel));
    if (/src\/app\/\(program\)\/.*page\.tsx$/.test(rel)) greske.push(...provjeriPristupStranice(tekst, rel, "stranica"));
    if (/src\/app\/api\/.*route\.ts$/.test(rel)) greske.push(...provjeriPristupStranice(tekst, rel, "ruta"));
    if (/src\/app\/portal\/.*page\.tsx$/.test(rel)) greske.push(...provjeriPristupStranice(tekst, rel, "stranica", true));
    if (/src\/app\/portal\/.*route\.ts$/.test(rel)) greske.push(...provjeriPristupStranice(tekst, rel, "ruta", true));
  }
  if (greske.length > 0) {
    console.error(`Provjera 'use server' nije prošla (${greske.length}):\n${greske.map((g) => `  ${g}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Provjera 'use server': u redu (${pregledano} datoteka).`);
}

glavno();
