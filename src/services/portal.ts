import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  istekSesije,
  jeEmail,
  normalizirajEmail,
  odluciOPrijavi,
  porukaZakljucano,
  PROZOR_POKUSAJA_MS,
  trebaProduljitiSesiju,
} from "@/domain/prijava";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { BCRYPT_COST, hashTokena } from "./prijava";

/**
 * Portal klijenata (korak 5.2): zasebna prijava i sesija (kolačić „erp_portal“), odvojena od korisnika programa.
 * Klijent vidi samo podatke svog partnera; svaka provjera ide kroz `provjeriSesijuPortala`.
 */
const PORUKA_KRIVO = "Neispravna e-pošta ili lozinka.";
/** pokušaji portala broje se odvojeno od prijave u program (isti e-mail može biti i korisnik i klijent) */
const kljucPokusaja = (email: string) => `portal:${email}`;

let lazniHash: string | null = null;
function hashZaUsporedbu(): string {
  lazniHash ??= bcrypt.hashSync("nepostojeci-klijent", BCRYPT_COST);
  return lazniHash;
}

export type RezultatPrijavePortala = { ok: true; token: string; istjece: Date } | { ok: false; greska: string };

export async function prijaviPortal(
  db: PrismaClient,
  u: { email: string; lozinka: string; ip: string; preglednik?: string | null },
  sada = new Date(),
): Promise<RezultatPrijavePortala> {
  const email = normalizirajEmail(u.email);
  if (!jeEmail(email) || !u.lozinka) return { ok: false, greska: PORUKA_KRIVO };
  const ip = u.ip || "nepoznat";
  const kljuc = kljucPokusaja(email);
  return db.$transaction(
    async (tx) => {
      await zakljucajKljuc(tx, `prijava:${kljuc}`);
      const od = new Date(sada.getTime() - PROZOR_POKUSAJA_MS);
      const [poEmailu, poIp] = await Promise.all([
        tx.pokusajPrijave.findMany({ where: { email: kljuc, vrijeme: { gt: od } }, select: { vrijeme: true, uspjeh: true, ip: true } }),
        tx.pokusajPrijave.findMany({ where: { ip, vrijeme: { gt: od } }, select: { vrijeme: true, uspjeh: true, ip: true } }),
      ]);
      const odluka = odluciOPrijavi(poEmailu, poIp, ip, sada);
      if (!odluka.dopusteno) return { ok: false as const, greska: porukaZakljucano(odluka.zakljucanoDo, sada) };
      // isti e-mail može biti klijent više firmi: prijava u onu kojoj lozinka odgovara
      const kandidati = await tx.korisnikPortala.findMany({
        where: { email, aktivan: true, lozinkaHash: { not: null }, partner: { aktivan: true }, firma: { aktivna: true } },
        orderBy: { stvoreno: "asc" },
        take: 5,
        select: { id: true, firmaId: true, lozinkaHash: true },
      });
      let pogodak: (typeof kandidati)[number] | null = null;
      for (const k of kandidati) if (!pogodak && (await bcrypt.compare(u.lozinka, k.lozinkaHash!))) pogodak = k;
      if (!kandidati.length) await bcrypt.compare(u.lozinka, hashZaUsporedbu());
      if (!pogodak) {
        await tx.pokusajPrijave.create({ data: { email: kljuc, ip, uspjeh: false, vrijeme: sada } });
        return { ok: false as const, greska: PORUKA_KRIVO };
      }
      const token = randomBytes(32).toString("base64url");
      const istjece = istekSesije(sada);
      await tx.pokusajPrijave.create({ data: { email: kljuc, ip, uspjeh: true, vrijeme: sada } });
      await tx.sesijaPortala.create({
        data: {
          id: hashTokena(token),
          firmaId: pogodak.firmaId,
          korisnikPortalaId: pogodak.id,
          istjece,
          zadnjaAktivnost: sada,
          ip,
          preglednik: u.preglednik?.slice(0, 500) ?? null,
        },
      });
      await tx.korisnikPortala.update({ where: { id: pogodak.id }, data: { zadnjaPrijava: sada } });
      return { ok: true as const, token, istjece };
    },
    { timeout: 15_000 },
  );
}

export type SesijaPortala = {
  sesijaId: string;
  korisnik: { id: string; ime: string; email: string };
  partner: { id: string; naziv: string };
  firma: { id: string; naziv: string };
};

/** Sesija klijenta ili null: istekla, odjavljena, klijent/partner/firma isključeni (isključenje odmah odjavljuje). */
export async function provjeriSesijuPortala(db: PrismaClient, token: string, sada = new Date()): Promise<SesijaPortala | null> {
  if (!token || token.length > 200) return null;
  const id = hashTokena(token);
  const s = await db.sesijaPortala.findUnique({
    where: { id },
    include: {
      korisnik: {
        select: {
          id: true,
          ime: true,
          email: true,
          aktivan: true,
          partner: { select: { id: true, naziv: true, aktivan: true } },
          firma: { select: { id: true, naziv: true, aktivna: true } },
        },
      },
    },
  });
  if (!s) return null;
  if (s.istjece <= sada) {
    await db.sesijaPortala.deleteMany({ where: { id } });
    return null;
  }
  const k = s.korisnik;
  if (!k.aktivan || !k.partner.aktivan || !k.firma.aktivna) return null;
  if (trebaProduljitiSesiju(s.zadnjaAktivnost, sada))
    await db.sesijaPortala.updateMany({ where: { id }, data: { zadnjaAktivnost: sada, istjece: istekSesije(sada) } });
  return {
    sesijaId: id,
    korisnik: { id: k.id, ime: k.ime, email: k.email },
    partner: { id: k.partner.id, naziv: k.partner.naziv },
    firma: { id: k.firma.id, naziv: k.firma.naziv },
  };
}

export async function odjaviPortal(db: PrismaClient, token: string): Promise<void> {
  if (token) await db.sesijaPortala.deleteMany({ where: { id: hashTokena(token) } });
}
