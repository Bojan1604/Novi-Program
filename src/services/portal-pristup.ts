import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import { jeEmail, normalizirajEmail, provjeriNovuLozinku } from "@/domain/prijava";
import { GreskaKorisniku } from "@/lib/greske";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { hashLozinke, hashTokena } from "./prijava";

/**
 * Upravljanje pristupom portalu (korak 5.4) — na kartici partnera: dodaj klijenta, isključi (odmah odjavljuje),
 * nova lozinka, poveznica za postavljanje lozinke (vrijedi 7 dana, jednokratna; nova poništava staru).
 * Lozinke i tokeni se nikad ne zapisuju u dnevnik.
 */
export const TRAJANJE_POVEZNICE_DANA = 7;

const noviToken = () => randomBytes(32).toString("base64url");
const istek = (sada: Date) => new Date(sada.getTime() + TRAJANJE_POVEZNICE_DANA * 864e5);

/** Nasumična lozinka koja prolazi pravila (bez znakova koji se lako zamijene: 0/O, 1/l/I). */
export function nasumicnaLozinka(): string {
  const znakovi = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(16);
  return Array.from(b, (x) => znakovi[x % znakovi.length])
    .join("")
    .replace(/^(.{5})(.{5})(.{6})$/, "$1-$2-$3");
}

async function klijentFirme(tx: Pick<PrismaClient, "$queryRaw" | "korisnikPortala">, firmaId: string, id: string) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Klijent ne postoji.");
  await tx.$queryRaw`SELECT id FROM "KorisnikPortala" WHERE id = ${id}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
  const k = await tx.korisnikPortala.findFirst({ where: { id, firmaId }, include: { partner: { select: { naziv: true } } } });
  if (!k) throw new GreskaKorisniku("Klijent ne postoji.");
  return k;
}

export async function dodajKlijentaPortala(
  db: PrismaClient,
  a: Akter,
  partnerId: string,
  u: { ime: string; email: string },
  sada = new Date(),
): Promise<{ id: string; token: string }> {
  if (!jeUuid(partnerId)) throw new GreskaKorisniku("Partner ne postoji.");
  const ime = u.ime.trim();
  const email = normalizirajEmail(u.email);
  if (!ime || ime.length > 100) throw new GreskaKorisniku("Upišite ime (do 100 znakova).");
  if (!jeEmail(email)) throw new GreskaKorisniku("E-pošta nije ispravna.");
  const f = a.firmaId;
  return db.$transaction(async (tx) => {
    const p = await tx.partner.findFirst({ where: { id: partnerId, firmaId: f }, select: { naziv: true, aktivan: true } });
    if (!p) throw new GreskaKorisniku("Partner ne postoji.");
    if (!p.aktivan) throw new GreskaKorisniku("Partner nije aktivan.");
    const postoji = await tx.korisnikPortala.findFirst({ where: { firmaId: f, email }, select: { partner: { select: { naziv: true } } } });
    if (postoji) throw new GreskaKorisniku(`E-pošta ${email} već ima pristup portalu (${postoji.partner.naziv}).`);
    const token = noviToken();
    const ja = (await tx.korisnik.findUnique({ where: { id: a.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    const k = await tx.korisnikPortala.create({
      data: {
        firmaId: f,
        partnerId,
        ime,
        email,
        poveznicaHash: hashTokena(token),
        poveznicaIstice: istek(sada),
        korisnikId: a.korisnikId,
        korisnik: ja,
      },
      select: { id: true },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "portal.upravljaj",
      entitet: "KorisnikPortala",
      entitetId: k.id,
      opis: `Pristup portalu za ${ime} (${email}), partner ${p.naziv}`,
      novo: { ime, email },
    });
    return { id: k.id, token };
  });
}

/** Isključenje odmah odjavljuje (sesije se brišu); uključenje vraća pristup s istom lozinkom. */
export async function postaviAktivnostKlijenta(db: PrismaClient, a: Akter, id: string, aktivan: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const k = await klijentFirme(tx, a.firmaId, id);
    await tx.korisnikPortala.update({ where: { id }, data: { aktivan, ...(aktivan ? {} : { poveznicaHash: null, poveznicaIstice: null }) } });
    if (!aktivan) await tx.sesijaPortala.deleteMany({ where: { firmaId: a.firmaId, korisnikPortalaId: id } });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "portal.upravljaj",
      entitet: "KorisnikPortala",
      entitetId: id,
      opis: `Portal: ${k.ime} (${k.email}) ${aktivan ? "uključen" : "isključen i odjavljen"}`,
      staro: { aktivan: k.aktivan },
      novo: { aktivan },
    });
  });
}

/** Nova poveznica za postavljanje lozinke (stara prestaje vrijediti). */
export async function novaPoveznicaKlijenta(db: PrismaClient, a: Akter, id: string, sada = new Date()): Promise<string> {
  return db.$transaction(async (tx) => {
    const k = await klijentFirme(tx, a.firmaId, id);
    if (!k.aktivan) throw new GreskaKorisniku("Klijent je isključen — prvo ga uključite.");
    const token = noviToken();
    await tx.korisnikPortala.update({ where: { id }, data: { poveznicaHash: hashTokena(token), poveznicaIstice: istek(sada) } });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "portal.upravljaj",
      entitet: "KorisnikPortala",
      entitetId: id,
      opis: `Portal: nova poveznica za lozinku — ${k.ime} (${k.email})`,
    });
    return token;
  });
}

/** Nova nasumična lozinka (prikazuje se jednom); sve sesije klijenta se odjavljuju. */
export async function novaLozinkaKlijenta(db: PrismaClient, a: Akter, id: string): Promise<string> {
  const lozinka = nasumicnaLozinka();
  const hash = await hashLozinke(lozinka);
  await db.$transaction(async (tx) => {
    const k = await klijentFirme(tx, a.firmaId, id);
    if (!k.aktivan) throw new GreskaKorisniku("Klijent je isključen — prvo ga uključite.");
    await tx.korisnikPortala.update({ where: { id }, data: { lozinkaHash: hash, poveznicaHash: null, poveznicaIstice: null } });
    await tx.sesijaPortala.deleteMany({ where: { firmaId: a.firmaId, korisnikPortalaId: id } });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "portal.upravljaj",
      entitet: "KorisnikPortala",
      entitetId: id,
      opis: `Portal: nova lozinka — ${k.ime} (${k.email}); sesije odjavljene`,
    });
  });
  return lozinka;
}

/** Klijent postavlja lozinku preko poveznice (jednokratna, 7 dana). Vraća e-poštu za prijavu. */
export async function postaviLozinkuPoveznicom(db: PrismaClient, token: string, lozinka: string, sada = new Date()): Promise<{ email: string }> {
  if (!token || token.length > 200) throw new GreskaKorisniku("Poveznica nije ispravna ili je istekla.");
  const hash = hashTokena(token);
  const k = await db.korisnikPortala.findUnique({
    where: { poveznicaHash: hash },
    select: { id: true, firmaId: true, email: true, aktivan: true, poveznicaIstice: true },
  });
  if (!k || !k.aktivan || !k.poveznicaIstice || k.poveznicaIstice <= sada) throw new GreskaKorisniku("Poveznica nije ispravna ili je istekla.");
  const g = provjeriNovuLozinku(lozinka, k.email);
  if (g) throw new GreskaKorisniku(g);
  const lozinkaHash = await hashLozinke(lozinka);
  await db.$transaction(async (tx) => {
    // jednokratno: poveznica se troši samo ako je još ista (dvije kartice)
    const r = await tx.korisnikPortala.updateMany({
      where: { id: k.id, poveznicaHash: hash },
      data: { lozinkaHash, poveznicaHash: null, poveznicaIstice: null },
    });
    if (!r.count) throw new GreskaKorisniku("Poveznica nije ispravna ili je istekla.");
    await tx.sesijaPortala.deleteMany({ where: { firmaId: k.firmaId, korisnikPortalaId: k.id } });
    await zapisiDnevnik(tx, {
      firmaId: k.firmaId,
      korisnikId: null,
      radnja: "portal.lozinka",
      entitet: "KorisnikPortala",
      entitetId: k.id,
      opis: `Portal: ${k.email} — lozinka postavljena preko poveznice`,
    });
  });
  return { email: k.email };
}
