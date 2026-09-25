import { efektivnaPrava, procitajIznimke, procitajPrava } from "@/domain/prava";
import type { DbFirme } from "@/lib/firma-db";

export async function popisClanova(db: DbFirme, firmaId: string) {
  const clanovi = await db.clanstvoFirme.findMany({
    where: { firmaId },
    include: {
      korisnik: { select: { id: true, ime: true, email: true, aktivan: true, zadnjaPrijava: true } },
      uloga: { select: { id: true, naziv: true } },
    },
    orderBy: [{ aktivno: "desc" }, { korisnik: { ime: "asc" } }],
  });
  return clanovi.map((c) => ({
    korisnikId: c.korisnikId,
    ime: c.korisnik.ime,
    email: c.korisnik.email,
    aktivan: c.aktivno && c.korisnik.aktivan,
    zadnjaPrijava: c.korisnik.zadnjaPrijava,
    uloga: c.uloga,
    imaIznimke: Object.keys(procitajIznimke(c.iznimke)).length > 0,
  }));
}

export async function clan(db: DbFirme, firmaId: string, korisnikId: string) {
  const c = await db.clanstvoFirme.findUnique({
    where: { firmaId_korisnikId: { firmaId, korisnikId } },
    include: { korisnik: { select: { id: true, ime: true, email: true, aktivan: true, zadnjaPrijava: true } }, uloga: true },
  });
  if (!c) return null;
  const pravaUloge = procitajPrava(c.uloga.prava);
  const iznimke = procitajIznimke(c.iznimke);
  return { ...c, pravaUloge, iznimke, prava: efektivnaPrava(pravaUloge, iznimke) };
}

export async function popisUloga(db: DbFirme, firmaId: string) {
  const uloge = await db.uloga.findMany({
    where: { firmaId },
    include: { _count: { select: { clanstva: true } } },
    orderBy: [{ sustavna: "desc" }, { naziv: "asc" }],
  });
  return uloge.map((u) => ({
    id: u.id,
    naziv: u.naziv,
    opis: u.opis,
    sustavna: u.sustavna,
    brojKorisnika: u._count.clanstva,
    prava: procitajPrava(u.prava),
  }));
}

export async function uloga(db: DbFirme, firmaId: string, id: string) {
  const u = await db.uloga.findFirst({ where: { id, firmaId }, include: { _count: { select: { clanstva: true } } } });
  if (!u) return null;
  return { id: u.id, naziv: u.naziv, opis: u.opis, sustavna: u.sustavna, brojKorisnika: u._count.clanstva, prava: procitajPrava(u.prava) };
}
