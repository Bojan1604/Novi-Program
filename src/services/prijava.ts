import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { ULOGA_ADMINISTRATOR } from "@/domain/prava";
import { zapisiDnevnik } from "./dnevnik";
import { napraviZadaneUloge } from "./korisnici";
import {
  istekSesije,
  jeEmail,
  normalizirajEmail,
  odluciOPrijavi,
  porukaZakljucano,
  PROZOR_POKUSAJA_MS,
  provjeriNovuLozinku,
  trebaProduljitiSesiju,
} from "@/domain/prijava";

export const BCRYPT_COST = 12;
const PORUKA_KRIVO = "Neispravna e-pošta ili lozinka.";

let lazniHash: string | null = null;
/** Za nepostojeću e-poštu i dalje se računa bcrypt, da se po vremenu ne vidi postoji li račun. */
function hashZaUsporedbu(): string {
  lazniHash ??= bcrypt.hashSync("nepostojeci-korisnik", BCRYPT_COST);
  return lazniHash;
}

export function hashTokena(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashLozinke(lozinka: string): Promise<string> {
  return bcrypt.hash(lozinka, BCRYPT_COST);
}

export type UlazPrijave = { email: string; lozinka: string; ip: string; preglednik?: string | null };

export type RezultatPrijave =
  | { ok: true; token: string; istjece: Date; korisnikId: string; firmaId: string }
  | { ok: false; greska: string };

/**
 * Prijava e-poštom i lozinkom. Pokušaji iste e-pošte izvode se jedan po jedan
 * (zaključavanje u bazi), pa istovremeni pokušaji ne mogu zaobići ograničenje.
 */
export async function prijavi(db: PrismaClient, ulaz: UlazPrijave, sada = new Date()): Promise<RezultatPrijave> {
  const email = normalizirajEmail(ulaz.email);
  if (!jeEmail(email) || ulaz.lozinka.length === 0) return { ok: false, greska: PORUKA_KRIVO };
  const ip = ulaz.ip || "nepoznat";

  return db.$transaction(
    async (tx) => {
      await zakljucajKljuc(tx, `prijava:${email}`);

      const od = new Date(sada.getTime() - PROZOR_POKUSAJA_MS);
      const [poEmailu, poIp] = await Promise.all([
        tx.pokusajPrijave.findMany({ where: { email, vrijeme: { gt: od } }, select: { vrijeme: true, uspjeh: true } }),
        tx.pokusajPrijave.findMany({ where: { ip, vrijeme: { gt: od } }, select: { vrijeme: true, uspjeh: true } }),
      ]);
      const odluka = odluciOPrijavi(poEmailu, poIp, sada);
      if (!odluka.dopusteno) return { ok: false as const, greska: porukaZakljucano(odluka.zakljucanoDo, sada) };

      const korisnik = await tx.korisnik.findUnique({
        where: { email },
        include: {
          clanstva: {
            where: { aktivno: true, firma: { aktivna: true } },
            orderBy: { stvoreno: "asc" },
            take: 1,
          },
        },
      });
      const lozinkaTocna = await bcrypt.compare(ulaz.lozinka, korisnik?.lozinkaHash ?? hashZaUsporedbu());
      const clanstvo = korisnik?.clanstva[0];

      if (!korisnik || !lozinkaTocna || !korisnik.aktivan || !clanstvo) {
        await tx.pokusajPrijave.create({ data: { email, ip, uspjeh: false, vrijeme: sada } });
        return { ok: false as const, greska: PORUKA_KRIVO };
      }

      const token = randomBytes(32).toString("base64url");
      const istjece = istekSesije(sada);
      await tx.pokusajPrijave.create({ data: { email, ip, uspjeh: true, vrijeme: sada } });
      await tx.sesija.create({
        data: {
          id: hashTokena(token),
          korisnikId: korisnik.id,
          firmaId: clanstvo.firmaId,
          istjece,
          zadnjaAktivnost: sada,
          ip,
          preglednik: ulaz.preglednik?.slice(0, 500) ?? null,
        },
      });
      await tx.korisnik.update({ where: { id: korisnik.id }, data: { zadnjaPrijava: sada } });
      return { ok: true as const, token, istjece, korisnikId: korisnik.id, firmaId: clanstvo.firmaId };
    },
    { timeout: 15_000 },
  );
}

export type Sesija = {
  sesijaId: string;
  korisnik: { id: string; ime: string; email: string };
  firma: { id: string; naziv: string };
};

/** Vraća sesiju za token ili null (istekla, odjavljena, korisnik/firma isključeni). */
export async function provjeriSesiju(db: PrismaClient, token: string, sada = new Date()): Promise<Sesija | null> {
  if (!token || token.length > 200) return null;
  const id = hashTokena(token);
  const sesija = await db.sesija.findUnique({
    where: { id },
    include: {
      korisnik: { select: { id: true, ime: true, email: true, aktivan: true } },
      firma: { select: { id: true, naziv: true, aktivna: true } },
    },
  });
  if (!sesija) return null;

  if (sesija.istjece <= sada) {
    await db.sesija.deleteMany({ where: { id } });
    return null;
  }
  if (!sesija.korisnik.aktivan || !sesija.firma.aktivna) return null;

  const clanstvo = await db.clanstvoFirme.findUnique({
    where: { firmaId_korisnikId: { firmaId: sesija.firmaId, korisnikId: sesija.korisnikId } },
    select: { aktivno: true },
  });
  if (!clanstvo?.aktivno) return null;

  if (trebaProduljitiSesiju(sesija.zadnjaAktivnost, sada)) {
    await db.sesija.updateMany({ where: { id }, data: { zadnjaAktivnost: sada, istjece: istekSesije(sada) } });
  }

  return {
    sesijaId: id,
    korisnik: { id: sesija.korisnik.id, ime: sesija.korisnik.ime, email: sesija.korisnik.email },
    firma: { id: sesija.firma.id, naziv: sesija.firma.naziv },
  };
}

export async function odjavi(db: PrismaClient, token: string): Promise<void> {
  if (!token) return;
  await db.sesija.deleteMany({ where: { id: hashTokena(token) } });
}

/** Odjava sa svih uređaja (npr. nakon promjene lozinke ili isključenja korisnika). */
export async function odjaviSveSesije(db: PrismaClient, korisnikId: string): Promise<number> {
  const r = await db.sesija.deleteMany({ where: { korisnikId } });
  return r.count;
}

export type UlazPrvogAdmina = { nazivFirme: string; oib: string; ime: string; email: string; lozinka: string };

/** Prva firma i njen administrator. Odbija ako u bazi već postoji ijedan korisnik. */
export async function napraviPrvogAdmina(db: PrismaClient, ulaz: UlazPrvogAdmina): Promise<{ firmaId: string; korisnikId: string }> {
  const email = normalizirajEmail(ulaz.email);
  if (!jeEmail(email)) throw new Error("E-pošta nije ispravna.");
  const greskaLozinke = provjeriNovuLozinku(ulaz.lozinka, email);
  if (greskaLozinke) throw new Error(greskaLozinke);
  if (!ulaz.nazivFirme.trim()) throw new Error("Upišite naziv firme.");
  if (!ulaz.ime.trim()) throw new Error("Upišite ime administratora.");
  const lozinkaHash = await hashLozinke(ulaz.lozinka);

  return db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, "prvi-admin");
    if ((await tx.korisnik.count()) > 0) throw new Error("Korisnici već postoje; prvi administrator se ne može ponovno napraviti.");
    const firma = await tx.firma.create({ data: { naziv: ulaz.nazivFirme.trim(), oib: ulaz.oib } });
    const uloge = await napraviZadaneUloge(tx, firma.id);
    const korisnik = await tx.korisnik.create({ data: { ime: ulaz.ime.trim(), email, lozinkaHash } });
    await tx.clanstvoFirme.create({ data: { firmaId: firma.id, korisnikId: korisnik.id, ulogaId: uloge[ULOGA_ADMINISTRATOR]! } });
    await zapisiDnevnik(tx, {
      firmaId: firma.id, korisnikId: null, radnja: "sustav.prvi-admin", entitet: "Firma", entitetId: firma.id,
      opis: `Napravljena firma ${firma.naziv} i administrator ${korisnik.ime} (${email})`,
      novo: { naziv: firma.naziv, oib: firma.oib, administrator: email },
    });
    return { firmaId: firma.id, korisnikId: korisnik.id };
  });
}
