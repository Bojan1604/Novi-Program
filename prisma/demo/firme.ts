import type { PrismaClient } from "../../src/generated/prisma/client";
import { napraviZadaneUloge } from "../../src/services/korisnici";
import { hashLozinke } from "../../src/services/prijava";
import type { Slucajno } from "./slucajno";

export const DEMO_LOZINKA = "Demo-lozinka-2026";

/** Prijava u demo: <uloga>@demo.hr / Demo-lozinka-2026 (admin@demo.hr, voditelj@…, prodavac@…) */
export const DEMO_KORISNICI = [
  { email: "admin@demo.hr", ime: "Ana Administrator", uloga: "Administrator" },
  { email: "voditelj@demo.hr", ime: "Vedran Voditelj", uloga: "Voditelj" },
  { email: "prodavac@demo.hr", ime: "Petra Prodavač", uloga: "Prodavač" },
  { email: "skladistar@demo.hr", ime: "Stjepan Skladištar", uloga: "Skladištar" },
  { email: "serviser@demo.hr", ime: "Sanja Serviser", uloga: "Serviser" },
  { email: "knjigovodja@demo.hr", ime: "Katarina Knjigovođa", uloga: "Knjigovođa" },
] as const;

export async function demoFirmeIKorisnici(prisma: PrismaClient, s: Slucajno) {
  const firma = await prisma.firma.create({ data: { naziv: "Demo Informatika d.o.o.", oib: s.oib(), boja: "#1d4ed8" } });
  const druga = await prisma.firma.create({ data: { naziv: "Demo Servis j.d.o.o.", oib: s.oib(), boja: "#0f766e" } });
  const uloge = await napraviZadaneUloge(prisma, firma.id);
  const ulogeDruge = await napraviZadaneUloge(prisma, druga.id);
  const lozinkaHash = await hashLozinke(DEMO_LOZINKA);
  const korisnici: Record<string, string> = {};
  for (const d of DEMO_KORISNICI) {
    const k = await prisma.korisnik.create({ data: { ime: d.ime, email: d.email, lozinkaHash } });
    await prisma.clanstvoFirme.create({ data: { firmaId: firma.id, korisnikId: k.id, ulogaId: uloge[d.uloga]! } });
    korisnici[d.uloga] = k.id;
  }
  // administrator radi u obje firme (za prebacivanje među firmama)
  await prisma.clanstvoFirme.create({ data: { firmaId: druga.id, korisnikId: korisnici["Administrator"]!, ulogaId: ulogeDruge["Administrator"]! } });
  return { firmaId: firma.id, drugaFirmaId: druga.id, korisnici };
}
