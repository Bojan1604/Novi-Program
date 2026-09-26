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
    const firma = await prisma.firma.create({ data: { naziv: E2E.firma, oib: "69435151530", boja: E2E.boja, iban: "HR1210010051863000160" } });
    const uloge = await napraviZadaneUloge(prisma, firma.id);
    await napraviZadaneSifrarnike(prisma, firma.id);
    const proizvodjac = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "E2E Proizvođač" } });
    const kategorija = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id, naziv: "Prijenosno računalo" } });
    const model = await prisma.modelUredaja.create({
      data: {
        firmaId: firma.id,
        naziv: "E2E Laptop 14",
        proizvodjacId: proizvodjac.id,
        kategorijaId: kategorija.id,
        preporucenaCijena: "1000.00",
        kpdProdaja: "26.20.11",
        kpdNajam: "77.33.11",
      },
    });
    const skladiste = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
    for (const [serijski, stanje, cpu] of [
      ["E2E-UR-001", "NA_SKLADISTU", "Intel i5"],
      ["E2E-UR-002", "NA_SKLADISTU", "Intel i7"],
      ["E2E-UR-003", "OTPISAN", "AMD Ryzen 5"],
      // kartica uređaja: po jedan za svaki projekt (ispravak, prilozi i brisanje)
      ["E2E-KARTICA-RACUNALO", "NA_SKLADISTU", "Intel i3"],
      ["E2E-KARTICA-MOBITEL", "NA_SKLADISTU", "Intel i3"],
      // skladišni dokumenti: po jedan za svaki projekt
      ["E2E-MSK-RACUNALO", "NA_SKLADISTU", "Intel i3"],
      ["E2E-MSK-MOBITEL", "NA_SKLADISTU", "Intel i3"],
      ["E2E-IZL-RACUNALO", "NA_SKLADISTU", "Intel i3"],
      ["E2E-IZL-MOBITEL", "NA_SKLADISTU", "Intel i3"],
      // prodaja: račun za skenirani uređaj
      ["E2E-PRODAJA-RACUNALO", "NA_SKLADISTU", "Intel i5"],
      ["E2E-PRODAJA-MOBITEL", "NA_SKLADISTU", "Intel i5"],
      ["E2E-STORNO-RACUNALO", "NA_SKLADISTU", "Intel i5"],
      ["E2E-STORNO-MOBITEL", "NA_SKLADISTU", "Intel i5"],
      // najam: po dva za svaki projekt
      ["E2E-NAJAM-RACUNALO-1", "NA_SKLADISTU", "Intel i5"],
      ["E2E-NAJAM-RACUNALO-2", "NA_SKLADISTU", "Intel i5"],
      ["E2E-NAJAM-MOBITEL-1", "NA_SKLADISTU", "Intel i5"],
      ["E2E-NAJAM-MOBITEL-2", "NA_SKLADISTU", "Intel i5"],
    ] as const) {
      await prisma.uredaj.create({
        data: {
          firmaId: firma.id,
          serijski,
          modelId: model.id,
          stanje,
          skladisteId: stanje === "OTPISAN" ? null : skladiste.id,
          cpu,
          nabavnaCijena: "700.00",
          nabavniDatum: new Date("2026-09-01"),
        },
      });
    }
    await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "E2E Split" } });
    // inventura: vlastito skladište s dva uređaja za svaki projekt
    for (const p of ["RACUNALO", "MOBITEL"]) {
      const polica = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: `E2E Polica ${p}` } });
      for (const n of [1, 2])
        await prisma.uredaj.create({
          data: { firmaId: firma.id, serijski: `E2E-INV-${p}-${n}`, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: polica.id },
        });
    }
    await prisma.usluga.create({ data: { firmaId: firma.id, naziv: "E2E Instalacija", jedinica: "h", cijena: "40.00" } });
    const distributer = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "E2E Distributer d.o.o.", kupac: false, dobavljac: true } });
    const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "E2E Kupac d.o.o.", oib: "33392005961", rokPlacanjaDana: 30 } });
    // servis: kupčev uređaj i zamjenski sa skladišta, za svaki projekt
    for (const p of ["RACUNALO", "MOBITEL"]) {
      await prisma.uredaj.create({
        data: { firmaId: firma.id, serijski: `E2E-SERVIS-${p}`, modelId: model.id, stanje: "PRODAN", partnerId: kupac.id },
      });
      await prisma.uredaj.create({
        data: { firmaId: firma.id, serijski: `E2E-ZAMJENA-${p}`, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skladiste.id },
      });
    }
    const lozinkaHash = bcrypt.hashSync(E2E.admin.lozinka, 4);
    for (const k of [
      { ime: E2E.admin.ime, email: E2E.admin.email, uloga: "Administrator" },
      { ime: E2E.prodavac.ime, email: E2E.prodavac.email, uloga: "Prodavač" },
      { ime: "Zaključani", email: E2E.zakljucavanje.email, uloga: "Prodavač" },
      { ime: E2E.voditelj.ime, email: E2E.voditelj.email, uloga: "Voditelj" },
      // prijava u dva koraka: zaseban korisnik po projektu
      { ime: "Dva koraka R", email: "dvakoraka-racunalo@e2e.hr", uloga: "Prodavač" },
      { ime: "Dva koraka M", email: "dvakoraka-mobitel@e2e.hr", uloga: "Prodavač" },
      // više firmi: zaseban administrator po projektu (prelazak mijenja firmu u koju ulazi prijava)
      { ime: "Firme R", email: "firme-racunalo@e2e.hr", uloga: "Administrator" },
      { ime: "Firme M", email: "firme-mobitel@e2e.hr", uloga: "Administrator" },
    ]) {
      const korisnik = await prisma.korisnik.create({ data: { ime: k.ime, email: k.email, lozinkaHash } });
      await prisma.clanstvoFirme.create({ data: { firmaId: firma.id, korisnikId: korisnik.id, ulogaId: uloge[k.uloga]! } });
    }
    // portal: klijent E2E Kupca s uređajem i drugi klijent s tuđim uređajem
    const hashPortala = bcrypt.hashSync(E2E.klijent.lozinka, 4);
    const drugi = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "E2E Drugi klijent d.o.o." } });
    for (const p of ["RACUNALO", "MOBITEL"])
      await prisma.uredaj.create({
        data: { firmaId: firma.id, serijski: `E2E-KVAR-${p}`, modelId: model.id, stanje: "PRODAN", partnerId: kupac.id },
      });
    await prisma.uredaj.create({
      data: {
        firmaId: firma.id,
        serijski: "E2E-PORTAL-1",
        modelId: model.id,
        stanje: "PRODAN",
        partnerId: kupac.id,
        jamstvoDo: new Date("2030-01-01"),
      },
    });
    await prisma.uredaj.create({ data: { firmaId: firma.id, serijski: "E2E-TUDJI-1", modelId: model.id, stanje: "PRODAN", partnerId: drugi.id } });
    await prisma.korisnikPortala.create({
      data: { firmaId: firma.id, partnerId: kupac.id, ime: E2E.klijent.ime, email: E2E.klijent.email, lozinkaHash: hashPortala },
    });
    await prisma.korisnikPortala.create({
      data: { firmaId: firma.id, partnerId: drugi.id, ime: "Drugi", email: E2E.drugiKlijent.email, lozinkaHash: hashPortala },
    });
    await prisma.korisnikPortala.create({
      data: { firmaId: firma.id, partnerId: distributer.id, ime: "Distributer", email: E2E.distributer.email, lozinkaHash: hashPortala },
    });
  } finally {
    await prisma.$disconnect();
  }
}

priprema().catch((greska: unknown) => {
  console.error(greska);
  process.exit(1);
});
