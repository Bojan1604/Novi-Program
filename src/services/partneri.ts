import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import type { UnosPartnera } from "@/domain/partner-unos";
import { GreskaKorisniku } from "@/lib/greske";
import { GreskaVanjska } from "@/lib/vanjski/dohvat";
import { dohvatiIzSudregistra, sudregPodesen } from "@/lib/vanjski/sudreg";
import { provjeriVies, type PodaciTvrtke } from "@/lib/vanjski/vies";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

type Tx = Prisma.TransactionClient;

/** Gdje se partner koristi — brisanje samo ako nigdje (dopunjuje se s novim modulima). */
export const REFERENCE_PARTNERA: { model: string; polje: string; naziv: string }[] = [
  { model: "uredaj", polje: "partnerId", naziv: "uređaja" },
  { model: "primka", polje: "dobavljacId", naziv: "primki" },
  { model: "dogadajUredaja", polje: "partnerId", naziv: "događaja u povijesti uređaja" },
  { model: "skladisniDokument", polje: "partnerId", naziv: "skladišnih dokumenata" },
];

function zaDnevnik(p: Record<string, unknown>) {
  const { id: _id, firmaId: _f, stvoreno: _s, azurirano: _a, ...ostalo } = p;
  return ostalo;
}

export async function spremiPartnera(db: PrismaClient, akter: Akter, id: string | null, u: UnosPartnera): Promise<string> {
  if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Partner ne postoji.");
  return db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `partner:${akter.firmaId}`);
    const stari = id ? await tx.partner.findFirst({ where: { id, firmaId: akter.firmaId } }) : null;
    if (id && !stari) throw new GreskaKorisniku("Partner ne postoji.");
    if (u.oib) {
      const isti = await tx.partner.findFirst({
        where: { firmaId: akter.firmaId, oib: u.oib, ...(id ? { NOT: { id } } : {}) },
        select: { naziv: true },
      });
      if (isti) throw new GreskaKorisniku(`Partner s tim OIB-om već postoji: ${isti.naziv}.`);
    }
    if (u.cjenikId && u.cjenikId !== stari?.cjenikId) {
      const c = await tx.cjenik.findFirst({ where: { id: u.cjenikId, firmaId: akter.firmaId }, select: { aktivan: true } });
      if (!c) throw new GreskaKorisniku("Cjenik ne postoji.");
      if (!c.aktivan) throw new GreskaKorisniku("Cjenik je deaktiviran.");
    }
    // promjena PDV broja poništava raniju VIES provjeru
    const vies = stari && stari.pdvBroj !== u.pdvBroj ? { viesValjan: null, viesProvjereno: null } : {};
    const eracun = stari && stari.eRacunAdresa !== u.eRacunAdresa ? { eRacunAktivan: null, eRacunProvjereno: null } : {};
    const zapis = stari
      ? await tx.partner.update({ where: { id: stari.id }, data: { ...u, ...vies, ...eracun } })
      : await tx.partner.create({ data: { ...u, firmaId: akter.firmaId } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "partneri.spremi",
      entitet: "Partner",
      entitetId: zapis.id,
      opis: `${stari ? "Izmijenjen" : "Novi"} partner ${zapis.naziv}`,
      staro: stari ? zaDnevnik(stari) : null,
      novo: zaDnevnik(zapis),
    });
    return zapis.id;
  });
}

async function partnerFirme(tx: Tx | PrismaClient, firmaId: string, id: string) {
  const p = jeUuid(id) ? await tx.partner.findFirst({ where: { id, firmaId } }) : null;
  if (!p) throw new GreskaKorisniku("Partner ne postoji.");
  return p;
}

export async function aktivnostPartnera(db: PrismaClient, akter: Akter, id: string, aktivan: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const p = await partnerFirme(tx, akter.firmaId, id);
    if (p.aktivan === aktivan) return;
    await tx.partner.update({ where: { id }, data: { aktivan } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "partneri.aktivnost",
      entitet: "Partner",
      entitetId: id,
      opis: `${aktivan ? "Aktiviran" : "Deaktiviran"} partner ${p.naziv}`,
      staro: { aktivan: p.aktivan },
      novo: { aktivan },
    });
  });
}

export async function obrisiPartnera(db: PrismaClient, akter: Akter, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const p = await partnerFirme(tx, akter.firmaId, id);
    for (const r of REFERENCE_PARTNERA) {
      const broj = await (tx as unknown as Record<string, { count(a: object): Promise<number> }>)[r.model]!.count({ where: { [r.polje]: id } });
      if (broj > 0) throw new GreskaKorisniku(`Partner se koristi na ${broj} ${r.naziv}; umjesto brisanja ga deaktivirajte.`);
    }
    await tx.poslovnica.deleteMany({ where: { partnerId: id, firmaId: akter.firmaId } });
    try {
      await tx.partner.delete({ where: { id } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2003") throw new GreskaKorisniku("Partner se koristi; umjesto brisanja ga deaktivirajte.");
      throw e;
    }
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "partneri.obrisi",
      entitet: "Partner",
      entitetId: id,
      opis: `Obrisan partner ${p.naziv}`,
      staro: zaDnevnik(p),
    });
  });
}

/**
 * Dohvat podataka tvrtke za obrazac (ne sprema): HR s OIB-om → sudski registar (ako je podešen),
 * inače VIES. Vraća i je li PDV broj valjan u VIES-u.
 */
export async function dohvatiPodatkeTvrtke(
  drzava: string,
  oib: string | null,
  pdvBroj: string | null,
): Promise<PodaciTvrtke & { viesValjan: boolean | null; izvor: string }> {
  try {
    if (drzava === "HR" && oib && sudregPodesen()) {
      const p = await dohvatiIzSudregistra(oib);
      if (p) return { ...p, viesValjan: null, izvor: "Sudski registar" };
    }
    const broj = pdvBroj ?? (drzava === "HR" && oib ? `HR${oib}` : null);
    if (!broj) throw new GreskaKorisniku(drzava === "HR" ? "Upišite OIB." : "Upišite PDV broj.");
    const r = await provjeriVies(broj);
    if (!r.valjan) throw new GreskaKorisniku(`VIES: ${broj} nije valjan PDV broj (ili subjekt nije u sustavu PDV-a).`);
    return { ...r.podaci, viesValjan: true, izvor: "VIES" };
  } catch (e) {
    if (e instanceof GreskaVanjska) throw new GreskaKorisniku(e.message);
    throw e;
  }
}

/** VIES provjera spremljenog partnera — rezultat se sprema (poslužitelj, ne preglednik). */
export async function provjeriViesPartnera(db: PrismaClient, akter: Akter, id: string): Promise<boolean> {
  const p = await partnerFirme(db, akter.firmaId, id);
  const broj = p.pdvBroj ?? (p.drzava === "HR" && p.oib ? `HR${p.oib}` : null);
  if (!broj) throw new GreskaKorisniku("Partner nema PDV broj.");
  let valjan: boolean;
  try {
    valjan = (await provjeriVies(broj)).valjan;
  } catch (e) {
    if (e instanceof GreskaVanjska) throw new GreskaKorisniku(e.message);
    throw e;
  }
  await db.$transaction(async (tx) => {
    await tx.partner.update({ where: { id }, data: { viesValjan: valjan, viesProvjereno: new Date() } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "partneri.vies",
      entitet: "Partner",
      entitetId: id,
      opis: `VIES provjera ${broj}: ${valjan ? "valjan" : "NIJE valjan"}`,
    });
  });
  return valjan;
}

// ─── Poslovnice ─────────────────────────────────────────────────────────────────

export type UnosPoslovnice = {
  naziv: string;
  adresa: string | null;
  postanskiBroj: string | null;
  mjesto: string | null;
  kontakt: string | null;
  telefon: string | null;
};

export async function spremiPoslovnicu(db: PrismaClient, akter: Akter, partnerId: string, id: string | null, u: UnosPoslovnice): Promise<string> {
  if (!u.naziv.trim()) throw new GreskaKorisniku("Upišite naziv poslovnice.");
  if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Poslovnica ne postoji.");
  return db.$transaction(async (tx) => {
    const p = await partnerFirme(tx, akter.firmaId, partnerId);
    const stara = id ? await tx.poslovnica.findFirst({ where: { id, partnerId, firmaId: akter.firmaId } }) : null;
    if (id && !stara) throw new GreskaKorisniku("Poslovnica ne postoji.");
    const z = stara
      ? await tx.poslovnica.update({ where: { id: stara.id }, data: u })
      : await tx.poslovnica.create({ data: { ...u, partnerId, firmaId: akter.firmaId } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "poslovnice.spremi",
      entitet: "Partner",
      entitetId: partnerId,
      opis: `${stara ? "Izmijenjena" : "Nova"} poslovnica ${z.naziv} (${p.naziv})`,
      staro: stara ? zaDnevnik(stara) : null,
      novo: zaDnevnik(z),
    });
    return z.id;
  });
}

export async function aktivnostPoslovnice(db: PrismaClient, akter: Akter, id: string, aktivan: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    const z = jeUuid(id) ? await tx.poslovnica.findFirst({ where: { id, firmaId: akter.firmaId } }) : null;
    if (!z) throw new GreskaKorisniku("Poslovnica ne postoji.");
    await tx.poslovnica.update({ where: { id }, data: { aktivan } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "poslovnice.spremi",
      entitet: "Partner",
      entitetId: z.partnerId,
      opis: `${aktivan ? "Aktivirana" : "Deaktivirana"} poslovnica ${z.naziv}`,
    });
  });
}

// ─── Cjenici ────────────────────────────────────────────────────────────────────

export async function spremiCjenik(
  db: PrismaClient,
  akter: Akter,
  id: string | null,
  u: { naziv: string; opis: string | null; popust: number | null; aktivan: boolean },
): Promise<string> {
  const naziv = u.naziv.trim();
  if (!naziv) throw new GreskaKorisniku("Upišite naziv cjenika.");
  if (u.popust !== null && (u.popust < 0 || u.popust > 100_00)) throw new GreskaKorisniku("Popust je 0–100 %.");
  if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Cjenik ne postoji.");
  return db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `cjenik:${akter.firmaId}`);
    const stari = id ? await tx.cjenik.findFirst({ where: { id, firmaId: akter.firmaId } }) : null;
    if (id && !stari) throw new GreskaKorisniku("Cjenik ne postoji.");
    const isti = await tx.cjenik.findFirst({
      where: { firmaId: akter.firmaId, naziv: { equals: naziv, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) },
    });
    if (isti) throw new GreskaKorisniku(`Cjenik „${naziv}“ već postoji.`);
    const data = { naziv, opis: u.opis, popust: u.popust === null ? null : centiUDecimal(u.popust), aktivan: u.aktivan };
    const z = stari
      ? await tx.cjenik.update({ where: { id: stari.id }, data })
      : await tx.cjenik.create({ data: { ...data, firmaId: akter.firmaId } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "cjenici.spremi",
      entitet: "Cjenik",
      entitetId: z.id,
      opis: `${stari ? "Izmijenjen" : "Novi"} cjenik ${naziv}`,
      staro: stari ? zaDnevnik(stari) : null,
      novo: zaDnevnik(z),
    });
    return z.id;
  });
}

/** Cijena stavke cjenika (model ili usluga); null cijena = ukloni stavku. */
export async function postaviCijenu(
  db: PrismaClient,
  akter: Akter,
  cjenikId: string,
  stavka: { modelId?: string; uslugaId?: string },
  cijenaCenti: number | null,
): Promise<void> {
  const { modelId, uslugaId } = stavka;
  if (!jeUuid(cjenikId) || (!modelId && !uslugaId) || (modelId && !jeUuid(modelId)) || (uslugaId && !jeUuid(uslugaId))) {
    throw new GreskaKorisniku("Odaberite model ili uslugu.");
  }
  if (cijenaCenti !== null && cijenaCenti < 0) throw new GreskaKorisniku("Cijena ne smije biti negativna.");
  await db.$transaction(async (tx) => {
    // dvije kartice postavljaju istu cijenu → jedna čeka drugu (inače P2002 na jedinstvenom ključu)
    await zakljucajKljuc(tx, `cjenik:${cjenikId}`);
    const c = await tx.cjenik.findFirst({ where: { id: cjenikId, firmaId: akter.firmaId } });
    if (!c) throw new GreskaKorisniku("Cjenik ne postoji.");
    const artikl = modelId
      ? await tx.modelUredaja.findFirst({ where: { id: modelId, firmaId: akter.firmaId }, select: { naziv: true } })
      : await tx.usluga.findFirst({ where: { id: uslugaId!, firmaId: akter.firmaId }, select: { naziv: true } });
    if (!artikl) throw new GreskaKorisniku("Model ili usluga ne postoji.");
    const kljuc = modelId ? { cjenikId, modelId } : { cjenikId, uslugaId: uslugaId! };
    const stara = await tx.stavkaCjenika.findFirst({ where: { ...kljuc, firmaId: akter.firmaId } });
    if (cijenaCenti === null) {
      if (stara) await tx.stavkaCjenika.delete({ where: { id: stara.id } });
    } else if (stara) {
      await tx.stavkaCjenika.update({ where: { id: stara.id }, data: { cijena: centiUDecimal(cijenaCenti) } });
    } else {
      await tx.stavkaCjenika.create({ data: { ...kljuc, firmaId: akter.firmaId, cijena: centiUDecimal(cijenaCenti) } });
    }
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "cjenici.stavka",
      entitet: "Cjenik",
      entitetId: cjenikId,
      opis: `Cjenik ${c.naziv}: ${artikl.naziv} ${cijenaCenti === null ? "uklonjen" : "postavljen"}`,
      staro: { cijena: stara ? centiIzDecimala(stara.cijena.toString()) : null },
      novo: { cijena: cijenaCenti },
    });
  });
}

/**
 * Prodajna cijena (bez PDV-a) modela ili usluge za kupca: stavka njegova cjenika, inače
 * preporučena cijena umanjena za popust cjenika, inače preporučena cijena. U centima; null = nema cijene.
 */
export async function cijenaZaKupca(
  db: PrismaClient | Tx,
  firmaId: string,
  partnerId: string | null,
  stavka: { modelId?: string; uslugaId?: string },
): Promise<number | null> {
  const osnovna = stavka.modelId
    ? (await db.modelUredaja.findFirst({ where: { id: stavka.modelId, firmaId }, select: { preporucenaCijena: true } }))?.preporucenaCijena
    : (await db.usluga.findFirst({ where: { id: stavka.uslugaId!, firmaId }, select: { cijena: true } }))?.cijena;
  const osnovnaCenti = osnovna ? centiIzDecimala(osnovna.toString()) : null;
  if (!partnerId) return osnovnaCenti;
  const p = await db.partner.findFirst({
    where: { id: partnerId, firmaId },
    select: { cjenik: { select: { id: true, aktivan: true, popust: true } } },
  });
  const cjenik = p?.cjenik;
  if (!cjenik?.aktivan) return osnovnaCenti;
  const s = await db.stavkaCjenika.findFirst({
    where: { firmaId, cjenikId: cjenik.id, ...(stavka.modelId ? { modelId: stavka.modelId } : { uslugaId: stavka.uslugaId! }) },
    select: { cijena: true },
  });
  if (s) return centiIzDecimala(s.cijena.toString());
  if (osnovnaCenti === null || !cjenik.popust) return osnovnaCenti;
  // popust u stotinkama postotka; zaokruživanje na cent (pola naviše)
  const popust = centiIzDecimala(cjenik.popust.toString());
  return Math.round((osnovnaCenti * (10_000 - popust)) / 10_000);
}
