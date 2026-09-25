import { randomUUID } from "node:crypto";
import type { Prisma } from "../../src/generated/prisma/client";
import { dodajDane, dodajMjesece, datum, type Datum } from "../../src/domain/datum";
import type { DemoKontekst } from "./index";

const CPU = ["Intel Core i5-1345U", "Intel Core i7-1365U", "AMD Ryzen 5 7530U", "AMD Ryzen 7 7730U", "Apple M2"];
const RAM = ["8 GB", "16 GB", "32 GB"];
const DISK = ["256 GB SSD", "512 GB SSD", "1 TB SSD"];
const OS = ["Windows 11 Pro", "Windows 11 Home", "bez OS-a", "macOS"];

/** Primke s uređajima (po 500 na primci), kronološki kroz zadnje dvije godine; sve kroz iste tablice kao program. */
export async function demoUredaji(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId, s, kolicine } = k;
  const modeli = await prisma.modelUredaja.findMany({
    where: { firmaId },
    select: { id: true, jamstvoMjeseci: true, preporucenaCijena: true, naziv: true },
  });
  const skladista = await prisma.skladiste.findMany({ where: { firmaId }, select: { id: true } });
  const dobavljaci = await prisma.partner.findMany({ where: { firmaId, dobavljac: true }, select: { id: true } });
  const stanjeNovo = await prisma.stanjeRobe.findFirst({ where: { firmaId, naziv: "Novo" }, select: { id: true } });
  const admin = k.korisnici["Skladištar"] ?? k.korisnici["Administrator"]!;
  if (!modeli.length || !skladista.length) return;

  const poPrimci = 500;
  const brojPrimki = Math.max(1, Math.ceil(kolicine.uredaja / poPrimci));
  const pocetak = datum("2024-10-01");
  const datumi = s.kronoloski(pocetak, brojPrimki, Math.max(1, Math.floor(700 / brojPrimki)));
  const redniPoGodini = new Map<number, number>();
  let serijski = 0;
  let uredajiSerija: Prisma.UredajCreateManyInput[] = [];
  let dogadajiSerija: Prisma.DogadajUredajaCreateManyInput[] = [];
  const isprazni = async () => {
    if (uredajiSerija.length) await prisma.uredaj.createMany({ data: uredajiSerija });
    if (dogadajiSerija.length) await prisma.dogadajUredaja.createMany({ data: dogadajiSerija });
    uredajiSerija = [];
    dogadajiSerija = [];
  };

  for (let p = 0; p < brojPrimki; p++) {
    const d: Datum = datumi[p]! > "2026-09-24" ? dodajDane(datum("2026-09-24"), -s.cijeli(0, 30)) : datumi[p]!;
    const godina = Number(d.slice(0, 4));
    const redni = (redniPoGodini.get(godina) ?? 0) + 1;
    redniPoGodini.set(godina, redni);
    const broj = `PRI-${redni}/${godina}`;
    const n = Math.min(poPrimci, kolicine.uredaja - p * poPrimci);
    const skladisteId = s.izaberi(skladista).id;
    const primkaId = randomUUID();
    let vrijednost = 0;
    const redovi: Prisma.UredajCreateManyInput[] = [];
    for (let i = 0; i < n; i++) {
      const m = s.izaberi(modeli);
      const preporucena = Math.round(Number(m.preporucenaCijena ?? 500) * 100);
      const nabavna = Math.round((preporucena * s.cijeli(70, 85)) / 100);
      vrijednost += nabavna;
      serijski++;
      const id = randomUUID();
      redovi.push({
        id,
        firmaId,
        serijski: `DEMO${String(serijski).padStart(7, "0")}`,
        modelId: m.id,
        stanje: "NA_SKLADISTU",
        skladisteId,
        stanjeRobeId: stanjeNovo?.id ?? null,
        primkaId,
        nabavnaCijena: (nabavna / 100).toFixed(2),
        nabavniDatum: new Date(`${d}T00:00:00Z`),
        jamstvoDo: new Date(`${dodajMjesece(d, m.jamstvoMjeseci)}T00:00:00Z`),
        cpu: s.izaberi(CPU),
        ram: s.izaberi(RAM),
        disk: s.izaberi(DISK),
        os: s.izaberi(OS),
      });
      dogadajiSerija.push({
        firmaId,
        uredajId: id,
        vrijeme: new Date(`${d}T08:00:00Z`),
        radnja: "zaprimanje",
        novoStanje: "NA_SKLADISTU",
        skladisteDoId: skladisteId,
        dokumentVrsta: "Primka",
        dokumentId: primkaId,
        dokumentBroj: broj,
        korisnikId: admin,
        korisnik: "Stjepan Skladištar",
      });
    }
    await prisma.primka.create({
      data: {
        id: primkaId,
        firmaId,
        broj,
        godina,
        redni,
        datum: new Date(`${d}T00:00:00Z`),
        skladisteId,
        dobavljacId: dobavljaci.length ? s.izaberi(dobavljaci).id : null,
        dokumentDobavljaca: `OTP-${s.cijeli(1000, 9999)}`,
        brojUredaja: n,
        nabavnaVrijednost: (vrijednost / 100).toFixed(2),
        korisnikId: admin,
        korisnik: "Stjepan Skladištar",
      },
    });
    uredajiSerija.push(...redovi);
    if (uredajiSerija.length >= 5000) await isprazni();
  }
  await isprazni();
  for (const [godina, zadnji] of redniPoGodini) await prisma.brojac.create({ data: { firmaId, vrsta: "primka", godina, zadnji } });
}
