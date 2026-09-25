/**
 * Punjenje demo podataka po modulima. Svaki modul dodaje svoju funkciju u KORACI
 * (redoslijed je bitan: partneri prije uređaja, uređaji prije računa…).
 * Isti kod puni i veliku bazu za mjerenje brzine (razlika je samo u količinama).
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { Slucajno } from "./slucajno";
import { demoFirmeIKorisnici } from "./firme";
import { demoPartneri } from "./partneri";
import { demoSifrarnici } from "./sifrarnici";

export type Kolicine = {
  /** uređaja po firmi (velika baza: 300.000) */
  uredaja: number;
  partnera: number;
  racuna: number;
  ugovora: number;
};

export const DEMO_KOLICINE: Kolicine = { uredaja: 400, partnera: 40, racuna: 150, ugovora: 20 };
export const VELIKA_KOLICINE: Kolicine = { uredaja: 300_000, partnera: 5_000, racuna: 100_000, ugovora: 3_000 };

export type DemoKontekst = {
  prisma: PrismaClient;
  s: Slucajno;
  kolicine: Kolicine;
  /** glavna demo firma i njeni korisnici po ulozi */
  firmaId: string;
  drugaFirmaId: string;
  korisnici: Record<string, string>;
  /** poruka za ispis */
  log: (poruka: string) => void;
};

type Korak = { naziv: string; izvedi: (k: DemoKontekst) => Promise<void> };

/** Koraci nakon firmi i korisnika — svaki modul dodaje svoj. */
export const KORACI: Korak[] = [
  { naziv: "Šifrarnici", izvedi: demoSifrarnici },
  { naziv: "Partneri", izvedi: demoPartneri },
];

export async function napuniDemo(
  prisma: PrismaClient,
  kolicine: Kolicine = DEMO_KOLICINE,
  log: (p: string) => void = console.log,
): Promise<DemoKontekst> {
  if ((await prisma.korisnik.count()) > 0) throw new Error("Demo podaci se učitavaju samo u praznu bazu.");
  const s = new Slucajno();
  const osnova = await demoFirmeIKorisnici(prisma, s);
  const k: DemoKontekst = { prisma, s, kolicine, ...osnova, log };
  log(`Firme i korisnici: ${Object.keys(osnova.korisnici).length} korisnika`);
  for (const korak of KORACI) {
    const pocetak = Date.now();
    await korak.izvedi(k);
    log(`${korak.naziv}: ${((Date.now() - pocetak) / 1000).toFixed(1)} s`);
  }
  return k;
}
