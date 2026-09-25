/**
 * npm run admin:prvi — prva firma i njen administrator.
 *
 * Pita podatke u terminalu (lozinka se ne prikazuje). Za automatizaciju se
 * podaci mogu dati varijablama: ADMIN_FIRMA, ADMIN_OIB, ADMIN_IME, ADMIN_EMAIL, ADMIN_LOZINKA.
 * S `--ako-nema` (pokreni.bat) ne radi ništa ako korisnici već postoje.
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { procitajOib } from "../src/domain/oib";
import { napraviPrismu } from "../src/lib/prisma";
import { napraviPrvogAdmina } from "../src/services/prijava";

let skriveno = false;
const izlaz = new Writable({
  write(dio, _kodiranje, gotovo) {
    if (!skriveno) process.stdout.write(dio);
    gotovo();
  },
});
const rl = createInterface({ input: process.stdin, output: izlaz, terminal: true });

function pitaj(pitanje: string, skrij = false): Promise<string> {
  return new Promise((rijesi) => {
    process.stdout.write(pitanje);
    skriveno = skrij;
    rl.question("", (odgovor) => {
      skriveno = false;
      if (skrij) process.stdout.write("\n");
      rijesi(odgovor.trim());
    });
  });
}

async function vrijednost(env: string, pitanje: string, skrij = false): Promise<string> {
  return process.env[env] ?? (await pitaj(pitanje, skrij));
}

async function glavno(): Promise<void> {
  if (process.argv.includes("--ako-nema")) {
    const prisma = napraviPrismu();
    const broj = await prisma.korisnik.count().finally(() => prisma.$disconnect());
    if (broj > 0) return;
    console.log("U bazi još nema korisnika — napravimo prvu firmu i administratora.");
  }
  console.log("Prvi administrator ERP-WMS\n");
  const nazivFirme = await vrijednost("ADMIN_FIRMA", "Naziv firme: ");
  let oib = procitajOib(await vrijednost("ADMIN_OIB", "OIB firme: "));
  while (!oib.ok && !process.env["ADMIN_OIB"]) {
    console.log(`  ${oib.greska}`);
    oib = procitajOib(await pitaj("OIB firme: "));
  }
  if (!oib.ok) throw new Error(oib.greska);
  const ime = await vrijednost("ADMIN_IME", "Ime i prezime: ");
  const email = await vrijednost("ADMIN_EMAIL", "E-pošta: ");
  const lozinka = await vrijednost("ADMIN_LOZINKA", "Lozinka (najmanje 10 znakova): ", true);
  if (!process.env["ADMIN_LOZINKA"]) {
    const ponovljena = await pitaj("Ponovite lozinku: ", true);
    if (ponovljena !== lozinka) throw new Error("Lozinke se ne podudaraju.");
  }

  const prisma = napraviPrismu();
  try {
    await napraviPrvogAdmina(prisma, { nazivFirme, oib: oib.vrijednost, ime, email, lozinka });
    console.log(`\n✔ Napravljeni su firma „${nazivFirme}“ i administrator ${email}. Prijavite se u programu.`);
  } finally {
    await prisma.$disconnect();
  }
}

glavno()
  .catch((greska: unknown) => {
    console.error(`\n✘ ${greska instanceof Error ? greska.message : String(greska)}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
