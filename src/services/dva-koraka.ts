import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { GreskaKorisniku } from "@/lib/greske";
import { desifriraj, sifriraj } from "@/lib/tajne";
import { hashRezervnog, novaTajna, otpauthAdresa, provjeriKod, rezervniKodovi } from "@/lib/totp";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

/**
 * Prijava u dva koraka (korak 6.4) na „Mom računu“: uključivanje traži lozinku i potvrdu kodom iz aplikacije,
 * isključivanje lozinku i kod. Tajna je šifrirana; rezervni kodovi prikazuju se samo jednom (u bazi hash).
 */
async function provjeriLozinku(db: PrismaClient, korisnikId: string, lozinka: string) {
  const k = await db.korisnik.findUniqueOrThrow({ where: { id: korisnikId } });
  if (!(await bcrypt.compare(lozinka, k.lozinkaHash))) throw new GreskaKorisniku("Lozinka nije ispravna.");
  return k;
}

const zapis = (tx: Parameters<typeof zapisiDnevnik>[0], a: Akter, opis: string) =>
  zapisiDnevnik(tx, {
    firmaId: a.firmaId,
    korisnikId: a.korisnikId,
    ip: a.ip,
    radnja: "racun.dva-koraka",
    entitet: "Korisnik",
    entitetId: a.korisnikId,
    opis,
  });

/** Prvi korak uključivanja: nova tajna (još neuključena) → adresa za QR i tajna za ručni upis. */
export async function zapocniDvaKoraka(db: PrismaClient, a: Akter, lozinka: string): Promise<{ tajna: string; adresa: string }> {
  const k = await provjeriLozinku(db, a.korisnikId, lozinka);
  if (k.totpUkljucen) throw new GreskaKorisniku("Prijava u dva koraka je već uključena.");
  const tajna = novaTajna();
  await db.korisnik.update({ where: { id: k.id }, data: { totpTajna: sifriraj(tajna), totpZadnjiKorak: null } });
  return { tajna, adresa: otpauthAdresa(tajna, k.email, "ERP-WMS") };
}

/** Potvrda kodom iz aplikacije: uključuje i vraća rezervne kodove (samo sada). */
export async function potvrdiDvaKoraka(db: PrismaClient, a: Akter, kod: string, sada = new Date()): Promise<string[]> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Korisnik" WHERE id = ${a.korisnikId}::uuid FOR UPDATE`;
    const k = await tx.korisnik.findUniqueOrThrow({ where: { id: a.korisnikId } });
    if (k.totpUkljucen) throw new GreskaKorisniku("Prijava u dva koraka je već uključena.");
    const tajna = desifriraj(k.totpTajna);
    if (!tajna) throw new GreskaKorisniku("Prvo pokrenite uključivanje (lozinka).");
    const korak = provjeriKod(tajna, kod, sada, k.totpZadnjiKorak);
    if (korak === null) throw new GreskaKorisniku("Kod nije ispravan — provjerite vrijeme na mobitelu.");
    const kodovi = rezervniKodovi();
    await tx.korisnik.update({ where: { id: k.id }, data: { totpUkljucen: true, totpZadnjiKorak: korak } });
    await tx.rezervniKod.deleteMany({ where: { korisnikId: k.id } });
    await tx.rezervniKod.createMany({ data: kodovi.map((x) => ({ korisnikId: k.id, hash: hashRezervnog(x) })) });
    await zapis(tx, a, `${k.ime}: uključena prijava u dva koraka`);
    return kodovi;
  });
}

export async function iskljuciDvaKoraka(db: PrismaClient, a: Akter, lozinka: string, kod: string, sada = new Date()): Promise<void> {
  const k = await provjeriLozinku(db, a.korisnikId, lozinka);
  if (!k.totpUkljucen) throw new GreskaKorisniku("Prijava u dva koraka nije uključena.");
  const tajna = desifriraj(k.totpTajna);
  const korak = tajna ? provjeriKod(tajna, kod, sada, k.totpZadnjiKorak) : null;
  let rezervni = false;
  if (korak === null) rezervni = (await db.rezervniKod.count({ where: { korisnikId: k.id, hash: hashRezervnog(kod), iskoristen: null } })) === 1;
  if (korak === null && !rezervni) throw new GreskaKorisniku("Kod nije ispravan.");
  await db.$transaction(async (tx) => {
    await tx.korisnik.update({ where: { id: k.id }, data: { totpUkljucen: false, totpTajna: null, totpZadnjiKorak: null } });
    await tx.rezervniKod.deleteMany({ where: { korisnikId: k.id } });
    await zapis(tx, a, `${k.ime}: isključena prijava u dva koraka`);
  });
}

export async function noviRezervniKodovi(db: PrismaClient, a: Akter, lozinka: string): Promise<string[]> {
  const k = await provjeriLozinku(db, a.korisnikId, lozinka);
  if (!k.totpUkljucen) throw new GreskaKorisniku("Prijava u dva koraka nije uključena.");
  const kodovi = rezervniKodovi();
  await db.$transaction(async (tx) => {
    await tx.rezervniKod.deleteMany({ where: { korisnikId: k.id } });
    await tx.rezervniKod.createMany({ data: kodovi.map((x) => ({ korisnikId: k.id, hash: hashRezervnog(x) })) });
    await zapis(tx, a, `${k.ime}: novi rezervni kodovi (stari više ne vrijede)`);
  });
  return kodovi;
}

export async function stanjeDvaKoraka(db: PrismaClient, korisnikId: string) {
  const [k, preostalo] = await Promise.all([
    db.korisnik.findUniqueOrThrow({ where: { id: korisnikId }, select: { totpUkljucen: true } }),
    db.rezervniKod.count({ where: { korisnikId, iskoristen: null } }),
  ]);
  return { ukljucen: k.totpUkljucen, preostaloRezervnih: preostalo };
}
