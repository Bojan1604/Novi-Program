/**
 * npm run mjerenje -- http://localhost:3000 /uredaji /racuni …
 * Prijavi se (MJERENJE_EMAIL / MJERENJE_LOZINKA, zadano demo administrator), otvori svaku
 * stranicu 3 puta i ispiše vrijeme odgovora poslužitelja i veličinu HTML-a. Pukne ako
 * stranica prelazi granice (0,5 s na poslužitelju, 1 MB).
 */
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const GRANICA_MS = Number(process.env["MJERENJE_GRANICA_MS"] ?? 500);
const GRANICA_BAJTOVA = 1_000_000;

async function glavno(): Promise<void> {
  const [adresa, ...putanje] = process.argv.slice(2);
  if (!adresa || putanje.length === 0) throw new Error("Upotreba: npm run mjerenje -- <adresa> <putanja>…");
  const lokalni = "/opt/pw-browsers/chromium";
  const preglednik = await chromium.launch(existsSync(lokalni) ? { executablePath: lokalni } : {});
  const stranica = await preglednik.newPage();
  await stranica.goto(`${adresa}/prijava`);
  await stranica.getByLabel("E-pošta").fill(process.env["MJERENJE_EMAIL"] ?? "admin@demo.hr");
  await stranica.getByLabel("Lozinka").fill(process.env["MJERENJE_LOZINKA"] ?? "Demo-lozinka-2026");
  await stranica.getByRole("button", { name: "Prijava" }).click();
  await stranica.getByRole("button", { name: "Odjava" }).waitFor();

  let losih = 0;
  for (const putanja of putanje) {
    const vremena: number[] = [];
    let velicina = 0;
    for (let i = 0; i < 3; i++) {
      const pocetak = performance.now();
      const odgovor = await stranica.request.get(`${adresa}${putanja}`);
      const tijelo = await odgovor.body();
      vremena.push(performance.now() - pocetak);
      velicina = tijelo.length;
    }
    const najbolje = Math.min(...vremena);
    const los = najbolje > GRANICA_MS || velicina > GRANICA_BAJTOVA;
    if (los) losih++;
    console.log(`${los ? "✘" : "✔"} ${putanja.padEnd(40)} ${najbolje.toFixed(0).padStart(6)} ms  ${(velicina / 1024).toFixed(0).padStart(6)} KB`);
  }
  await preglednik.close();
  if (losih > 0) {
    console.error(`\n${losih} stranica prelazi granice (${GRANICA_MS} ms, 1 MB).`);
    process.exit(1);
  }
}

glavno().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
