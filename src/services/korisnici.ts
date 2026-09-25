import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { jeEmail, normalizirajEmail, provjeriNovuLozinku } from "@/domain/prijava";
import {
  MODULI,
  POPIS_MODULA,
  POPIS_POSEBNIH,
  POSEBNA,
  efektivnaPrava,
  jeAdministrator,
  procitajIznimke,
  procitajPrava,
  smijeUpravljati,
  smijeUrediti,
  ZADANE_ULOGE,
  type Iznimke,
  type Prava,
} from "@/domain/prava";
import { jeUuid } from "@/domain/id";
import { GreskaKorisniku } from "@/lib/greske";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { zapisiDnevnik } from "./dnevnik";
import { hashLozinke, odjaviSveSesije } from "./prijava";

type Tx = Prisma.TransactionClient;
type Baza = PrismaClient | Tx;

/** Zadane uloge za novu firmu; vraća id-eve po nazivu (npr. uloge["Administrator"]). */
export async function napraviZadaneUloge(tx: Baza, firmaId: string): Promise<Record<string, string>> {
  const idevi: Record<string, string> = {};
  for (const u of ZADANE_ULOGE) {
    const uloga = await tx.uloga.create({
      data: { firmaId, naziv: u.naziv, opis: u.opis, prava: u.prava, sustavna: u.sustavna ?? false },
    });
    idevi[u.naziv] = uloga.id;
  }
  return idevi;
}

/** Stvarna prava korisnika u firmi ili null ako nije (aktivan) član. */
export async function pravaClana(db: Baza, firmaId: string, korisnikId: string): Promise<Prava | null> {
  const c = await db.clanstvoFirme.findUnique({
    where: { firmaId_korisnikId: { firmaId, korisnikId } },
    select: { aktivno: true, iznimke: true, uloga: { select: { prava: true } } },
  });
  if (!c?.aktivno) return null;
  return efektivnaPrava(procitajPrava(c.uloga.prava), procitajIznimke(c.iznimke));
}

export type Akter = { korisnikId: string; firmaId: string; prava: Prava; ip?: string | null };

/** Prava kao ravna polja za dnevnik: { "Prodaja": "operativno", "Nabavne cijene i marže": "da" } */
function pravaZaDnevnik(p: Prava): Record<string, string> {
  return {
    ...Object.fromEntries(POPIS_MODULA.map((m) => [MODULI[m], p.moduli[m]])),
    ...Object.fromEntries(POPIS_POSEBNIH.map((x) => [POSEBNA[x], p.posebna[x] ? "da" : "ne"])),
  };
}

async function clanZaUpravljanje(tx: Tx, firmaId: string, korisnikId: string) {
  if (!jeUuid(korisnikId)) throw new GreskaKorisniku("Korisnik nije član ove firme.");
  const c = await tx.clanstvoFirme.findUnique({
    where: { firmaId_korisnikId: { firmaId, korisnikId } },
    include: { uloga: true, korisnik: true },
  });
  if (!c) throw new GreskaKorisniku("Korisnik nije član ove firme.");
  return { ...c, prava: efektivnaPrava(procitajPrava(c.uloga.prava), procitajIznimke(c.iznimke)) };
}

/** Broj aktivnih članova s punim pravima (bez zadanog korisnika). */
async function brojDrugihAdministratora(tx: Tx, firmaId: string, bezKorisnika: string): Promise<number> {
  const clanovi = await tx.clanstvoFirme.findMany({
    where: { firmaId, aktivno: true, korisnikId: { not: bezKorisnika }, korisnik: { aktivan: true } },
    select: { iznimke: true, uloga: { select: { prava: true } } },
  });
  return clanovi.filter((c) => jeAdministrator(efektivnaPrava(procitajPrava(c.uloga.prava), procitajIznimke(c.iznimke)))).length;
}

function provjeri(odluka: { dopusteno: true } | { dopusteno: false; razlog: string }): void {
  if (!odluka.dopusteno) throw new GreskaKorisniku(odluka.razlog);
}

export type NoviKorisnik = { ime: string; email: string; lozinka: string; ulogaId: string };

/** Dodaje novog korisnika u firmu (e-pošta ne smije postojati). */
export async function dodajKorisnika(db: PrismaClient, akter: Akter, ulaz: NoviKorisnik): Promise<{ korisnikId: string }> {
  const email = normalizirajEmail(ulaz.email);
  if (!ulaz.ime.trim()) throw new GreskaKorisniku("Upišite ime.");
  if (!jeEmail(email)) throw new GreskaKorisniku("E-pošta nije ispravna.");

  return db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `korisnik:${email}`);
    const uloga = jeUuid(ulaz.ulogaId) ? await tx.uloga.findFirst({ where: { id: ulaz.ulogaId, firmaId: akter.firmaId } }) : null;
    if (!uloga) throw new GreskaKorisniku("Odaberite ulogu.");
    provjeri(smijeUpravljati({ id: akter.korisnikId, prava: akter.prava }, { id: "novi", prava: procitajPrava({}) }, procitajPrava(uloga.prava)));

    // Postojeći korisnik (iz druge firme) se NE pripaja sam: inače bi firma koja ga je
    // napravila znala lozinku računa koji koristi druga firma. Rad u više firmi ide preko poziva.
    if (await tx.korisnik.findUnique({ where: { email }, select: { id: true } })) {
      throw new GreskaKorisniku("Ta e-pošta je već zauzeta.");
    }

    const greska = provjeriNovuLozinku(ulaz.lozinka, email);
    if (greska) throw new GreskaKorisniku(greska);
    const korisnik = await tx.korisnik.create({ data: { ime: ulaz.ime.trim(), email, lozinkaHash: await hashLozinke(ulaz.lozinka) } });
    await tx.clanstvoFirme.create({ data: { firmaId: akter.firmaId, korisnikId: korisnik.id, ulogaId: uloga.id } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "korisnici.dodaj",
      entitet: "Korisnik",
      entitetId: korisnik.id,
      opis: `Dodan korisnik ${korisnik.ime} (${email}) s ulogom ${uloga.naziv}`,
      novo: { ime: korisnik.ime, email, uloga: uloga.naziv },
    });
    return { korisnikId: korisnik.id };
  });
}

export type IzmjenaKorisnika = { ime?: string; ulogaId?: string; iznimke?: Iznimke; aktivno?: boolean };

export async function urediKorisnika(db: PrismaClient, akter: Akter, korisnikId: string, izmjena: IzmjenaKorisnika): Promise<void> {
  await db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `clanstvo:${akter.firmaId}`);
    const cilj = await clanZaUpravljanje(tx, akter.firmaId, korisnikId);

    const stareIznimke = procitajIznimke(cilj.iznimke);
    const mijenjaPrava =
      (izmjena.ulogaId !== undefined && izmjena.ulogaId !== cilj.ulogaId) ||
      (izmjena.iznimke !== undefined && JSON.stringify(procitajIznimke(izmjena.iznimke)) !== JSON.stringify(stareIznimke));
    let novaUloga = cilj.uloga;
    if (izmjena.ulogaId !== undefined && izmjena.ulogaId !== cilj.ulogaId) {
      const u = jeUuid(izmjena.ulogaId) ? await tx.uloga.findFirst({ where: { id: izmjena.ulogaId, firmaId: akter.firmaId } }) : null;
      if (!u) throw new GreskaKorisniku("Uloga ne postoji.");
      novaUloga = u;
    }
    const noveIznimke = izmjena.iznimke ? procitajIznimke(izmjena.iznimke) : stareIznimke;
    const novaPrava = efektivnaPrava(procitajPrava(novaUloga.prava), noveIznimke);

    provjeri(
      smijeUpravljati({ id: akter.korisnikId, prava: akter.prava }, { id: korisnikId, prava: cilj.prava }, mijenjaPrava ? novaPrava : undefined),
    );
    if (izmjena.aktivno === false && korisnikId === akter.korisnikId) throw new GreskaKorisniku("Ne možete isključiti sami sebe.");

    const gubiAdmina = jeAdministrator(cilj.prava) && (izmjena.aktivno === false || !jeAdministrator(novaPrava));
    if (gubiAdmina && (await brojDrugihAdministratora(tx, akter.firmaId, korisnikId)) === 0) {
      throw new GreskaKorisniku("Firma mora imati barem jednog aktivnog administratora.");
    }

    if (izmjena.ime !== undefined && izmjena.ime.trim() !== cilj.korisnik.ime) {
      if (!izmjena.ime.trim()) throw new GreskaKorisniku("Upišite ime.");
      // ime je zajedničko svim firmama korisnika — jedna firma ga ne mijenja drugima
      const drugaClanstva = await tx.clanstvoFirme.count({ where: { korisnikId, firmaId: { not: akter.firmaId } } });
      if (drugaClanstva > 0 && korisnikId !== akter.korisnikId)
        throw new GreskaKorisniku("Korisnik radi i u drugoj firmi; ime može promijeniti samo on sam.");
      await tx.korisnik.update({ where: { id: korisnikId }, data: { ime: izmjena.ime.trim() } });
    }
    await tx.clanstvoFirme.update({
      where: { id: cilj.id },
      data: {
        ...(mijenjaPrava ? { ulogaId: novaUloga.id, iznimke: noveIznimke as Prisma.InputJsonValue } : {}),
        ...(izmjena.aktivno !== undefined ? { aktivno: izmjena.aktivno } : {}),
      },
    });
    if (izmjena.aktivno === false) {
      await tx.sesija.deleteMany({ where: { korisnikId, firmaId: akter.firmaId } });
    }
    const opisIznimki = (iz: Iznimke) => (Object.keys(iz).length ? JSON.stringify(iz) : "nema");
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "korisnici.uredi",
      entitet: "Korisnik",
      entitetId: korisnikId,
      opis: `Izmijenjen korisnik ${izmjena.ime?.trim() || cilj.korisnik.ime}`,
      staro: { ime: cilj.korisnik.ime, uloga: cilj.uloga.naziv, iznimke: opisIznimki(stareIznimke), aktivan: cilj.aktivno },
      novo: {
        ...(izmjena.ime !== undefined ? { ime: izmjena.ime.trim() } : {}),
        ...(mijenjaPrava ? { uloga: novaUloga.naziv, iznimke: opisIznimki(noveIznimke) } : {}),
        ...(izmjena.aktivno !== undefined ? { aktivan: izmjena.aktivno } : {}),
      },
    });
  });
}

/** Nova lozinka drugom korisniku (ili sebi). Odjavljuje ga sa svih uređaja. */
export async function postaviLozinku(db: PrismaClient, akter: Akter, korisnikId: string, lozinka: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const cilj = await clanZaUpravljanje(tx, akter.firmaId, korisnikId);
    provjeri(smijeUpravljati({ id: akter.korisnikId, prava: akter.prava }, { id: korisnikId, prava: cilj.prava }));
    // korisnik u više firmi: lozinku smije mijenjati samo tko smije upravljati njime u SVIM firmama
    const drugaClanstva = await tx.clanstvoFirme.count({ where: { korisnikId, firmaId: { not: akter.firmaId } } });
    if (drugaClanstva > 0 && korisnikId !== akter.korisnikId) {
      throw new GreskaKorisniku("Korisnik radi i u drugoj firmi; lozinku može promijeniti samo on sam.");
    }
    const greska = provjeriNovuLozinku(lozinka, cilj.korisnik.email);
    if (greska) throw new GreskaKorisniku(greska);
    await tx.korisnik.update({ where: { id: korisnikId }, data: { lozinkaHash: await hashLozinke(lozinka) } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "korisnici.lozinka",
      entitet: "Korisnik",
      entitetId: korisnikId,
      opis: `Postavljena nova lozinka korisniku ${cilj.korisnik.ime}; odjavljen sa svih uređaja`,
      promjene: [{ polje: "lozinka", staro: "(skriveno)", novo: "(promijenjeno)" }],
    });
  });
  await odjaviSveSesije(db, korisnikId);
}

export type UlazUloge = { id?: string; naziv: string; opis: string; prava: Prava };

export async function spremiUlogu(db: PrismaClient, akter: Akter, ulaz: UlazUloge): Promise<string> {
  const naziv = ulaz.naziv.trim();
  if (!naziv) throw new GreskaKorisniku("Upišite naziv uloge.");
  provjeri(smijeUrediti(akter.prava, ulaz.prava));

  return db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `clanstvo:${akter.firmaId}`);
    const isti = await tx.uloga.findFirst({
      where: { firmaId: akter.firmaId, naziv: { equals: naziv, mode: "insensitive" }, NOT: ulaz.id ? { id: ulaz.id } : undefined },
    });
    if (isti) throw new GreskaKorisniku("Uloga s tim nazivom već postoji.");

    if (!ulaz.id) {
      const u = await tx.uloga.create({ data: { firmaId: akter.firmaId, naziv, opis: ulaz.opis.trim(), prava: ulaz.prava } });
      await zapisiDnevnik(tx, {
        firmaId: akter.firmaId,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "uloge.spremi",
        entitet: "Uloga",
        entitetId: u.id,
        opis: `Nova uloga ${naziv}`,
        novo: { naziv, opis: ulaz.opis.trim(), ...pravaZaDnevnik(ulaz.prava) },
      });
      return u.id;
    }

    const uloga = jeUuid(ulaz.id) ? await tx.uloga.findFirst({ where: { id: ulaz.id, firmaId: akter.firmaId } }) : null;
    if (!uloga) throw new GreskaKorisniku("Uloga ne postoji.");
    if (uloga.sustavna) throw new GreskaKorisniku("Uloga Administrator se ne može mijenjati.");

    const clanovi = await tx.clanstvoFirme.findMany({ where: { ulogaId: uloga.id }, select: { korisnikId: true, iznimke: true } });
    if (clanovi.some((c) => c.korisnikId === akter.korisnikId)) {
      throw new GreskaKorisniku("Ne možete mijenjati ulogu koju i sami imate (to bi promijenilo vaša prava).");
    }
    // akter mora moći upravljati svim korisnicima te uloge, prije i poslije izmjene
    const stara = procitajPrava(uloga.prava);
    for (const c of clanovi) {
      const iz = procitajIznimke(c.iznimke);
      provjeri(
        smijeUpravljati(
          { id: akter.korisnikId, prava: akter.prava },
          { id: c.korisnikId, prava: efektivnaPrava(stara, iz) },
          efektivnaPrava(ulaz.prava, iz),
        ),
      );
    }
    await tx.uloga.update({ where: { id: uloga.id }, data: { naziv, opis: ulaz.opis.trim(), prava: ulaz.prava } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "uloge.spremi",
      entitet: "Uloga",
      entitetId: uloga.id,
      opis: `Izmijenjena uloga ${naziv}${clanovi.length ? ` (${clanovi.length} korisnika)` : ""}`,
      staro: { naziv: uloga.naziv, opis: uloga.opis, ...pravaZaDnevnik(stara) },
      novo: { naziv, opis: ulaz.opis.trim(), ...pravaZaDnevnik(ulaz.prava) },
    });
    return uloga.id;
  });
}

export async function obrisiUlogu(db: PrismaClient, akter: Akter, ulogaId: string): Promise<void> {
  provjeri(smijeUrediti(akter.prava, procitajPrava({})));
  await db.$transaction(async (tx) => {
    const uloga = jeUuid(ulogaId) ? await tx.uloga.findFirst({ where: { id: ulogaId, firmaId: akter.firmaId } }) : null;
    if (!uloga) throw new GreskaKorisniku("Uloga ne postoji.");
    if (uloga.sustavna) throw new GreskaKorisniku("Uloga Administrator se ne može obrisati.");
    const broj = await tx.clanstvoFirme.count({ where: { ulogaId } });
    if (broj > 0) throw new GreskaKorisniku(`Ulogu ima ${broj} korisnik(a); prvo im dodijelite drugu ulogu.`);
    await tx.uloga.delete({ where: { id: ulogaId } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "uloge.obrisi",
      entitet: "Uloga",
      entitetId: ulogaId,
      opis: `Obrisana uloga ${uloga.naziv}`,
      staro: { naziv: uloga.naziv, opis: uloga.opis },
    });
  });
}

/** Promjena vlastite lozinke (svaki korisnik; traži trenutnu lozinku). Odjavljuje ostale uređaje. */
export async function promijeniVlastituLozinku(db: PrismaClient, akter: Akter & { sesijaId: string }, trenutna: string, nova: string): Promise<void> {
  const k = await db.korisnik.findUniqueOrThrow({ where: { id: akter.korisnikId } });
  if (!(await bcrypt.compare(trenutna, k.lozinkaHash))) throw new GreskaKorisniku("Trenutna lozinka nije ispravna.");
  if (trenutna === nova) throw new GreskaKorisniku("Nova lozinka mora biti različita od trenutne.");
  const greska = provjeriNovuLozinku(nova, k.email);
  if (greska) throw new GreskaKorisniku(greska);
  await db.$transaction(async (tx) => {
    await tx.korisnik.update({ where: { id: k.id }, data: { lozinkaHash: await hashLozinke(nova) } });
    await tx.sesija.deleteMany({ where: { korisnikId: k.id, NOT: { id: akter.sesijaId } } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "racun.lozinka",
      entitet: "Korisnik",
      entitetId: k.id,
      opis: `${k.ime} je promijenio vlastitu lozinku; ostali uređaji odjavljeni`,
      promjene: [{ polje: "lozinka", staro: "(skriveno)", novo: "(promijenjeno)" }],
    });
  });
}
