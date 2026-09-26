/**
 * npm run snimke -- http://localhost:3000 [--izlaz snimke]
 *
 * Korak 7.3: svaka stranica (isti popis kao `mjerenje -- --sve`) na mobitelu (390 px) i računalu (1440 px),
 * u svijetloj i tamnoj temi: snimka cijele stranice, provjera vodoravnog pomicanja i kontrasta teksta
 * (axe-core, pravilo WCAG AA „color-contrast“). Pukne ako ijedna stranica ima problem.
 * Prijava: MJERENJE_EMAIL / MJERENJE_LOZINKA (zadano demo administrator); id-evi kartica iz DATABASE_URL.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { svePutanje } from "./lib/putanje";

const require = createRequire(import.meta.url);
const TEME = ["svijetla", "tamna"] as const;
const EKRANI = [
  { ime: "mobitel", width: 390, height: 844, mobitel: true },
  { ime: "racunalo", width: 1440, height: 900, mobitel: false },
] as const;

type Nalaz = { putanja: string; ekran: string; tema: string; problem: string };

async function prijavljeno(preglednik: Browser, adresa: string, ekran: (typeof EKRANI)[number], tema: string) {
  const kontekst = await preglednik.newContext({
    viewport: { width: ekran.width, height: ekran.height },
    isMobile: ekran.mobitel,
    hasTouch: ekran.mobitel,
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    colorScheme: tema === "tamna" ? "dark" : "light",
  });
  await kontekst.addCookies([{ name: "tema", value: tema, url: adresa }]);
  const stranica = await kontekst.newPage();
  await stranica.goto(`${adresa}/prijava`);
  await stranica.getByLabel("E-pošta").fill(process.env["MJERENJE_EMAIL"] ?? "admin@demo.hr");
  await stranica.getByLabel("Lozinka").fill(process.env["MJERENJE_LOZINKA"] ?? "Demo-lozinka-2026");
  await stranica.getByRole("button", { name: "Prijava" }).click();
  await stranica.getByRole("button", { name: "Odjava" }).waitFor();
  return { kontekst, stranica };
}

async function glavno(): Promise<void> {
  const argumenti = process.argv.slice(2);
  const adresa = argumenti[0];
  if (!adresa) throw new Error("Upotreba: npm run snimke -- <adresa> [--izlaz mapa]");
  const i = argumenti.indexOf("--izlaz");
  const izlaz = path.resolve(i >= 0 ? argumenti[i + 1]! : "snimke");
  mkdirSync(izlaz, { recursive: true });
  const putanje = await svePutanje();
  const axe = require.resolve("axe-core/axe.min.js");
  const lokalni = "/opt/pw-browsers/chromium";
  const preglednik = await chromium.launch(existsSync(lokalni) ? { executablePath: lokalni } : {});
  const nalazi: Nalaz[] = [];
  try {
    for (const ekran of EKRANI)
      for (const tema of TEME) {
        const { kontekst, stranica } = await prijavljeno(preglednik, adresa, ekran, tema);
        for (const putanja of putanje) {
          const n = (problem: string) => nalazi.push({ putanja, ekran: ekran.ime, tema, problem });
          const odgovor = await stranica.goto(`${adresa}${putanja}`);
          if (!odgovor || odgovor.status() >= 400) {
            n(`HTTP ${odgovor?.status() ?? "bez odgovora"}`);
            continue;
          }
          await stranica.waitForLoadState("networkidle");
          const ime = `${ekran.ime}-${tema}${putanja.replace(/[^\w-]+/g, "_")}.png`;
          await stranica.screenshot({ path: path.join(izlaz, ime), fullPage: true });
          const sirina = await stranica.evaluate(() => document.documentElement.scrollWidth);
          if (sirina > ekran.width) n(`vodoravno pomicanje: ${sirina} px`);
          await stranica.addScriptTag({ path: axe });
          const krsenja = await stranica.evaluate(async () => {
            const a = (
              window as unknown as {
                axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { nodes: { target: string[]; failureSummary: string }[] }[] }> };
              }
            ).axe;
            const r = await a.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } });
            return r.violations.flatMap((v) =>
              v.nodes.map((x) => `${x.target.join(" ")} — ${x.failureSummary.split("\n").slice(1, 2).join(" ").trim()}`),
            );
          });
          for (const k of krsenja.slice(0, 10)) n(`kontrast: ${k}`);
          if (krsenja.length > 10) n(`kontrast: … još ${krsenja.length - 10}`);
        }
        await kontekst.close();
      }
  } finally {
    await preglednik.close();
  }
  writeFileSync(path.join(izlaz, "nalazi.json"), JSON.stringify(nalazi, null, 2));
  const stranica = new Set(nalazi.map((x) => x.putanja));
  console.log(`Snimke: ${izlaz} (${putanje.length} stranica × ${EKRANI.length} ekrana × ${TEME.length} teme)`);
  for (const x of nalazi) console.log(`✘ ${x.ekran.padEnd(8)} ${x.tema.padEnd(8)} ${x.putanja}: ${x.problem}`);
  if (nalazi.length) {
    console.error(`\n${nalazi.length} problema na ${stranica.size} stranica.`);
    process.exit(1);
  }
  console.log("✔ Bez vodoravnog pomicanja i bez problema s kontrastom.");
}

glavno().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
