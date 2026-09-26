import { procitajOib } from "@/domain/oib";
import { jeAdministrator, procitajPrava, smijeUpravljati, ULOGA_ADMINISTRATOR } from "@/domain/prava";
import { jeEmail, normalizirajEmail } from "@/domain/prijava";
import { jeUuid } from "@/domain/id";
import type { PrismaClient } from "@/generated/prisma/client";
import { GreskaKorisniku } from "@/lib/greske";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { zapisiDnevnik } from "./dnevnik";
import { napraviZadaneUloge, type Akter } from "./korisnici";
import { napraviZadaneSifrarnike } from "./sifrarnici";

/**
 * Više firmi (korak 6.8): korisnik radi u svakoj firmi u kojoj ima aktivno članstvo; sesija je
 * uvijek u jednoj firmi, a svi podaci idu kroz dbFirme te firme. Prelazak mijenja firmu sesije.
 * U firmu se ulazi samo na poziv koji korisnik sam prihvati (ili kao novi korisnik te firme).
 */

/** Firme u kojima korisnik ima aktivno članstvo. */
export async function mojeFirme(db: PrismaClient, korisnikId: string) {
  const c = await db.clanstvoFirme.findMany({
    where: { korisnikId, aktivno: true, firma: { aktivna: true } },
    orderBy: { firma: { naziv: "asc" } },
    select: { firma: { select: { id: true, naziv: true, oib: true } }, uloga: { select: { naziv: true } } },
  });
  return c.map((x) => ({ ...x.firma, uloga: x.uloga.naziv }));
}

/** Prelazak u drugu firmu: ista sesija, druga firma (samo uz aktivno članstvo). */
export async function prebaciFirmu(db: PrismaClient, s: { sesijaId: string; korisnikId: string; ip: string | null }, firmaId: string) {
  if (!jeUuid(firmaId)) throw new GreskaKorisniku("Firma ne postoji.");
  const c = await db.clanstvoFirme.findUnique({
    where: { firmaId_korisnikId: { firmaId, korisnikId: s.korisnikId } },
    select: { aktivno: true, firma: { select: { aktivna: true, naziv: true } } },
  });
  if (!c?.aktivno || !c.firma.aktivna) throw new GreskaKorisniku("Nemate pristup toj firmi.");
  await db.$transaction(async (tx) => {
    await tx.sesija.update({ where: { id: s.sesijaId, korisnikId: s.korisnikId }, data: { firmaId } });
    await tx.korisnik.update({ where: { id: s.korisnikId }, data: { zadnjaFirmaId: firmaId } });
  });
  return { naziv: c.firma.naziv };
}

/** Nova firma: samo administrator trenutne firme; on postaje administrator nove (zadane uloge i šifrarnici). */
export async function novaFirma(db: PrismaClient, akter: Akter, ulaz: { naziv: string; oib: string }): Promise<{ id: string }> {
  if (!jeAdministrator(akter.prava)) throw new GreskaKorisniku("Novu firmu može napraviti samo administrator.");
  const naziv = ulaz.naziv.trim();
  if (!naziv || naziv.length > 200) throw new GreskaKorisniku("Upišite naziv firme.");
  const oib = procitajOib(ulaz.oib);
  if (!oib.ok) throw new GreskaKorisniku(oib.greska);
  return db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `firma-oib:${oib.vrijednost}`);
    if (await tx.firma.findUnique({ where: { oib: oib.vrijednost }, select: { id: true } }))
      throw new GreskaKorisniku("Firma s tim OIB-om već postoji.");
    const firma = await tx.firma.create({ data: { naziv, oib: oib.vrijednost } });
    const uloge = await napraviZadaneUloge(tx, firma.id);
    await napraviZadaneSifrarnike(tx, firma.id);
    await tx.clanstvoFirme.create({ data: { firmaId: firma.id, korisnikId: akter.korisnikId, ulogaId: uloge[ULOGA_ADMINISTRATOR]! } });
    const opis = `Napravljena firma ${naziv} (OIB ${oib.vrijednost})`;
    for (const firmaId of [firma.id, akter.firmaId])
      await zapisiDnevnik(tx, {
        firmaId,
        korisnikId: akter.korisnikId,
        radnja: "firme.nova",
        entitet: "Firma",
        entitetId: firma.id,
        opis,
        ip: akter.ip ?? null,
      });
    return { id: firma.id };
  });
}

/**
 * Poziv u firmu po e-pošti. Ne otkriva postoji li račun (poziv čeka dok se osoba ne prijavi).
 * Uloga ne smije imati više prava od onoga tko poziva.
 */
export async function pozoviKorisnika(db: PrismaClient, akter: Akter, ulaz: { email: string; ulogaId: string }): Promise<void> {
  const email = normalizirajEmail(ulaz.email);
  if (!jeEmail(email)) throw new GreskaKorisniku("E-pošta nije ispravna.");
  await db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `poziv:${akter.firmaId}:${email}`);
    const uloga = jeUuid(ulaz.ulogaId) ? await tx.uloga.findFirst({ where: { id: ulaz.ulogaId, firmaId: akter.firmaId } }) : null;
    if (!uloga) throw new GreskaKorisniku("Odaberite ulogu.");
    const o = smijeUpravljati({ id: akter.korisnikId, prava: akter.prava }, { id: "novi", prava: procitajPrava({}) }, procitajPrava(uloga.prava));
    if (!o.dopusteno) throw new GreskaKorisniku(o.razlog);
    const clan = await tx.clanstvoFirme.findFirst({ where: { firmaId: akter.firmaId, korisnik: { email } }, select: { aktivno: true } });
    if (clan)
      throw new GreskaKorisniku(
        clan.aktivno ? "Taj korisnik je već u firmi." : "Taj korisnik je u firmi, ali isključen — uključite ga u popisu korisnika.",
      );
    const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    const p = await tx.pozivUFirmu.upsert({
      where: { firmaId_email: { firmaId: akter.firmaId, email } },
      create: { firmaId: akter.firmaId, email, ulogaId: uloga.id, korisnikId: akter.korisnikId, korisnik: ime },
      update: { ulogaId: uloga.id, korisnikId: akter.korisnikId, korisnik: ime },
    });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      radnja: "korisnici.poziv",
      entitet: "PozivUFirmu",
      entitetId: p.id,
      opis: `Poziv u firmu za ${email} s ulogom ${uloga.naziv}`,
      ip: akter.ip ?? null,
    });
  });
}

export async function otkaziPoziv(db: PrismaClient, akter: Akter, id: string): Promise<void> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Poziv ne postoji.");
  await db.$transaction(async (tx) => {
    const p = await tx.pozivUFirmu.findUnique({ where: { firmaId_id: { firmaId: akter.firmaId, id } } });
    if (!p) throw new GreskaKorisniku("Poziv ne postoji.");
    await tx.pozivUFirmu.delete({ where: { id } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      radnja: "korisnici.poziv-otkazan",
      entitet: "PozivUFirmu",
      entitetId: id,
      opis: `Otkazan poziv za ${p.email}`,
      ip: akter.ip ?? null,
    });
  });
}

/** Pozivi koji čekaju prijavljenog korisnika. */
export async function mojiPozivi(db: PrismaClient, email: string) {
  const p = await db.pozivUFirmu.findMany({
    where: { email: normalizirajEmail(email), firma: { aktivna: true } },
    orderBy: { stvoreno: "asc" },
    select: { id: true, korisnik: true, stvoreno: true, firma: { select: { naziv: true } }, uloga: { select: { naziv: true } } },
  });
  return p.map((x) => ({ id: x.id, firma: x.firma.naziv, uloga: x.uloga.naziv, pozvao: x.korisnik, stvoreno: x.stvoreno }));
}

/** Prihvaćanje ili odbijanje poziva — samo osoba s tom e-poštom. */
export async function odgovoriNaPoziv(
  db: PrismaClient,
  korisnik: { id: string; email: string },
  pozivId: string,
  prihvati: boolean,
  ip: string | null,
): Promise<{ firmaId: string }> {
  if (!jeUuid(pozivId)) throw new GreskaKorisniku("Poziv ne postoji.");
  return db.$transaction(async (tx) => {
    const p = await tx.pozivUFirmu.findUnique({ where: { id: pozivId }, include: { uloga: { select: { naziv: true } } } });
    if (!p || p.email !== normalizirajEmail(korisnik.email)) throw new GreskaKorisniku("Poziv ne postoji.");
    await zakljucajKljuc(tx, `clanstvo:${p.firmaId}`);
    await tx.pozivUFirmu.delete({ where: { id: p.id } });
    if (prihvati) {
      await tx.clanstvoFirme.upsert({
        where: { firmaId_korisnikId: { firmaId: p.firmaId, korisnikId: korisnik.id } },
        create: { firmaId: p.firmaId, korisnikId: korisnik.id, ulogaId: p.ulogaId },
        update: { ulogaId: p.ulogaId, aktivno: true, iznimke: {} },
      });
    }
    await zapisiDnevnik(tx, {
      firmaId: p.firmaId,
      korisnikId: korisnik.id,
      radnja: prihvati ? "korisnici.poziv-prihvacen" : "korisnici.poziv-odbijen",
      entitet: "PozivUFirmu",
      entitetId: p.id,
      opis: `Poziv za ${korisnik.email} je ${prihvati ? "prihvaćen" : "odbijen"} (uloga ${p.uloga.naziv})`,
      ip,
    });
    return { firmaId: p.firmaId };
  });
}
