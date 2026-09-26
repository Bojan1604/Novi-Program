import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { danas as danasU, jeDatum } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { jeMjesec, mjesecOd, type Mjesec } from "@/domain/najam";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import { imaPosebno, type Prava } from "@/domain/prava";
import { dospjeliMjeseci, ZADANE_KATEGORIJE_TROSKOVA } from "@/domain/troskovi";
import { trosakNarudzbenice } from "@/domain/trosak-robe";
import { GreskaKorisniku } from "@/lib/greske";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

type Tx = Prisma.TransactionClient;
const d = (x: string) => new Date(`${x}T00:00:00Z`);
const dan = (x: Date) => x.toISOString().slice(0, 10);
const c = (x: Prisma.Decimal | null) => (x ? centiIzDecimala(x.toFixed(2)) : 0);

/** Zadane kategorije kad firma još nema nijednu. */
export async function kategorijeTroskova(db: PrismaClient | Tx, firmaId: string) {
  const postoje = await db.kategorijaTroska.findMany({ where: { firmaId }, orderBy: { naziv: "asc" } });
  if (postoje.length) return postoje;
  await db.kategorijaTroska.createMany({ data: ZADANE_KATEGORIJE_TROSKOVA.map((naziv) => ({ firmaId, naziv })), skipDuplicates: true });
  return db.kategorijaTroska.findMany({ where: { firmaId }, orderBy: { naziv: "asc" } });
}

export async function dodajKategoriju(db: PrismaClient, akter: Akter, naziv: string) {
  const n = naziv.trim();
  if (!n || n.length > 60) throw new GreskaKorisniku("Upišite naziv kategorije (do 60 znakova).");
  if (await db.kategorijaTroska.count({ where: { firmaId: akter.firmaId, naziv: { equals: n, mode: "insensitive" } } }))
    throw new GreskaKorisniku("Kategorija već postoji.");
  await db.kategorijaTroska.create({ data: { firmaId: akter.firmaId, naziv: n } });
}

export type UlazTroska = { datum: string; kategorijaId: string; opis: string; iznos: number; pdv: number; placeno: boolean };

function provjeri(u: UlazTroska): Record<string, string> {
  const g: Record<string, string> = {};
  if (!jeDatum(u.datum)) g["datum"] = "Datum nije ispravan.";
  if (!jeUuid(u.kategorijaId)) g["kategorijaId"] = "Odaberite kategoriju.";
  if (!u.opis.trim()) g["opis"] = "Upišite opis.";
  if (u.opis.length > 300) g["opis"] = "Opis je predug.";
  if (!Number.isSafeInteger(u.iznos) || u.iznos === 0) g["iznos"] = "Upišite iznos.";
  if (!Number.isSafeInteger(u.pdv) || u.pdv < 0) g["pdv"] = "PDV nije ispravan.";
  return g;
}

export async function spremiTrosak(
  db: PrismaClient,
  akter: Akter,
  id: string | null,
  u: UlazTroska,
): Promise<{ ok: true; id: string } | { ok: false; polja: Record<string, string> }> {
  const polja = provjeri(u);
  if (Object.keys(polja).length) return { ok: false, polja };
  if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Trošak ne postoji.");
  const f = akter.firmaId;
  return db.$transaction(async (tx): Promise<{ ok: true; id: string } | { ok: false; polja: Record<string, string> }> => {
    if (!(await tx.kategorijaTroska.count({ where: { id: u.kategorijaId, firmaId: f } })))
      return { ok: false, polja: { kategorijaId: "Kategorija ne postoji." } };
    const podaci = {
      datum: d(u.datum),
      kategorijaId: u.kategorijaId,
      opis: u.opis.trim(),
      iznos: centiUDecimal(u.iznos),
      pdv: centiUDecimal(u.pdv),
      placeno: u.placeno,
      datumPlacanja: u.placeno ? d(danasU()) : null,
    };
    let trosakId: string;
    if (id) {
      const s = await tx.trosak.findFirst({ where: { id, firmaId: f } });
      if (!s) throw new GreskaKorisniku("Trošak ne postoji.");
      await tx.trosak.update({ where: { id }, data: { ...podaci, datumPlacanja: u.placeno ? (s.datumPlacanja ?? podaci.datumPlacanja) : null } });
      trosakId = id;
    } else {
      const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
      trosakId = (await tx.trosak.create({ data: { ...podaci, firmaId: f, korisnikId: akter.korisnikId, korisnik: ime }, select: { id: true } })).id;
    }
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "troskovi.spremi",
      entitet: "Trosak",
      entitetId: trosakId,
      opis: `${id ? "Izmijenjen" : "Novi"} trošak: ${u.opis.trim()} (${(u.iznos / 100).toFixed(2)} €)`,
    });
    return { ok: true, id: trosakId };
  });
}

/** Plaćeno ↔ neplaćeno (u oba smjera, s datumom plaćanja). */
export async function oznaciPlaceno(db: PrismaClient, akter: Akter, id: string, placeno: boolean, datum: string | null = null) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Trošak ne postoji.");
  if (datum !== null && !jeDatum(datum)) throw new GreskaKorisniku("Datum nije ispravan.");
  const f = akter.firmaId;
  await db.$transaction(async (tx) => {
    const s = await tx.trosak.findFirst({ where: { id, firmaId: f } });
    if (!s) throw new GreskaKorisniku("Trošak ne postoji.");
    await tx.trosak.update({ where: { id }, data: { placeno, datumPlacanja: placeno ? d(datum ?? danasU()) : null } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "troskovi.placeno",
      entitet: "Trosak",
      entitetId: id,
      opis: `${s.opis}: ${placeno ? "plaćeno" : "vraćeno na neplaćeno"}`,
      staro: { placeno: s.placeno },
      novo: { placeno },
    });
  });
}

export async function obrisiTrosak(db: PrismaClient, akter: Akter, id: string) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Trošak ne postoji.");
  const f = akter.firmaId;
  await db.$transaction(async (tx) => {
    const s = await tx.trosak.findFirst({ where: { id, firmaId: f } });
    if (!s) throw new GreskaKorisniku("Trošak ne postoji.");
    await tx.prilog.deleteMany({ where: { firmaId: f, entitet: "Trosak", entitetId: id } });
    await tx.trosak.delete({ where: { id } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "troskovi.obrisi",
      entitet: "Trosak",
      entitetId: id,
      opis: `Obrisan trošak ${s.opis} (${s.iznos.toFixed(2)} €)`,
    });
  });
}

export type UlazPonavljajuceg = { kategorijaId: string; opis: string; iznos: number; pdv: number; dan: number; od: Mjesec; do: Mjesec | null };

export async function spremiPonavljajuci(db: PrismaClient, akter: Akter, u: UlazPonavljajuceg): Promise<string> {
  if (!jeUuid(u.kategorijaId)) throw new GreskaKorisniku("Odaberite kategoriju.");
  if (!u.opis.trim()) throw new GreskaKorisniku("Upišite opis.");
  if (!Number.isSafeInteger(u.iznos) || u.iznos <= 0) throw new GreskaKorisniku("Upišite iznos.");
  if (!Number.isInteger(u.dan) || u.dan < 1 || u.dan > 31) throw new GreskaKorisniku("Dan u mjesecu: 1–31.");
  if (!jeMjesec(u.od) || (u.do !== null && (!jeMjesec(u.do) || u.do < u.od))) throw new GreskaKorisniku("Provjerite razdoblje.");
  const f = akter.firmaId;
  return db.$transaction(async (tx) => {
    if (!(await tx.kategorijaTroska.count({ where: { id: u.kategorijaId, firmaId: f } }))) throw new GreskaKorisniku("Kategorija ne postoji.");
    const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    const p = await tx.ponavljajuciTrosak.create({
      data: {
        firmaId: f,
        kategorijaId: u.kategorijaId,
        opis: u.opis.trim(),
        iznos: centiUDecimal(u.iznos),
        pdv: centiUDecimal(u.pdv),
        dan: u.dan,
        od: d(`${u.od}-01`),
        do: u.do ? d(`${u.do}-01`) : null,
        korisnikId: akter.korisnikId,
        korisnik: ime,
      },
      select: { id: true },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "troskovi.ponavljajuci",
      entitet: "PonavljajuciTrosak",
      entitetId: p.id,
      opis: `Ponavljajući trošak ${u.opis.trim()}: ${(u.iznos / 100).toFixed(2)} € svakog ${u.dan}. u mjesecu od ${u.od}`,
    });
    return p.id;
  });
}

export async function zaustaviPonavljajuci(db: PrismaClient, akter: Akter, id: string) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Ponavljajući trošak ne postoji.");
  const r = await db.ponavljajuciTrosak.updateMany({ where: { id, firmaId: akter.firmaId }, data: { aktivan: false } });
  if (!r.count) throw new GreskaKorisniku("Ponavljajući trošak ne postoji.");
}

/** Stvara dospjele ponavljajuće troškove (sve firme ili jedna). Jedinstveno po mjesecu — drugo pokretanje ne stvara ništa. */
export async function stvoriPonavljajuce(db: PrismaClient, firmaId: string | null, sada = new Date()): Promise<number> {
  const danas = danasU(sada);
  const lista = await db.ponavljajuciTrosak.findMany({ where: { aktivan: true, ...(firmaId ? { firmaId } : {}) } });
  let n = 0;
  for (const p of lista) {
    const mjeseci = dospjeliMjeseci(
      { od: mjesecOd(dan(p.od)), do: p.do ? mjesecOd(dan(p.do)) : null, dan: p.dan, zadnji: p.zadnji ? mjesecOd(dan(p.zadnji)) : null },
      danas,
    );
    if (!mjeseci.length) continue;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PonavljajuciTrosak" WHERE id = ${p.id}::uuid AND "firmaId" = ${p.firmaId}::uuid FOR UPDATE`;
      const r = await tx.trosak.createMany({
        data: mjeseci.map((m) => ({
          firmaId: p.firmaId,
          datum: d(m.datum),
          kategorijaId: p.kategorijaId,
          opis: p.opis,
          iznos: p.iznos,
          pdv: p.pdv,
          ponavljajuciId: p.id,
          mjesec: d(`${m.mjesec}-01`),
          korisnik: "Ponavljajući",
        })),
        skipDuplicates: true,
      });
      await tx.ponavljajuciTrosak.update({ where: { id: p.id }, data: { zadnji: d(`${mjeseci.at(-1)!.mjesec}-01`) } });
      n += r.count;
    });
  }
  return n;
}

export type RedakTroska = {
  id: string;
  izvor: "RUCNI" | "PONAVLJAJUCI" | "ULAZNI" | "NARUDZBENICA" | "PRIMKA";
  datum: string;
  kategorija: string;
  opis: string;
  iznos: number;
  placeno: boolean;
  veza: string | null;
};

/**
 * Svi troškovi razdoblja: ručni i ponavljajući, ulazni računi (usluge, prijevoz, računi bez narudžbenice),
 * trošak robe po narudžbenici (pravilo iz domain/trosak-robe.ts) i primke bez narudžbenice označene „knjiži u troškove“.
 * Trošak robe i primke vide se samo uz pravo nabavnih cijena.
 */
export async function pregledTroskova(db: PrismaClient | Tx, firmaId: string, prava: Prava, od: string, doD: string): Promise<RedakTroska[]> {
  const vidiNabavu = imaPosebno(prava, "costs");
  const razdoblje = { gte: d(od), lte: d(doD) };
  const [rucni, ulazni, narudzbenice, primke] = await Promise.all([
    db.trosak.findMany({ where: { firmaId, datum: razdoblje }, include: { kategorija: { select: { naziv: true } } } }),
    db.ulazniRacun.findMany({
      where: { firmaId, datum: razdoblje, status: { in: ["EVIDENTIRAN", "PRIHVACEN"] } },
      select: {
        id: true,
        interni: true,
        broj: true,
        datum: true,
        osnovica: true,
        ukupno: true,
        placeno: true,
        zaRobu: true,
        narudzbenicaId: true,
        dobavljacTekst: true,
        dobavljac: { select: { naziv: true } },
      },
    }),
    vidiNabavu
      ? db.narudzbenica.findMany({
          where: { firmaId, datum: razdoblje, status: { not: "STORNIRANA" } },
          select: {
            id: true,
            broj: true,
            datum: true,
            dobavljac: { select: { naziv: true } },
            primke: { select: { id: true, status: true, nabavnaVrijednost: true } },
            ulazniRacuni: { select: { id: true, status: true, zaRobu: true, osnovica: true } },
          },
        })
      : [],
    vidiNabavu
      ? db.primka.findMany({
          where: { firmaId, datum: razdoblje, status: "IZDANA", narudzbenicaId: null, knjiziUTroskove: true },
          select: { id: true, broj: true, datum: true, nabavnaVrijednost: true },
        })
      : [],
  ]);
  const r: RedakTroska[] = [];
  for (const t of rucni)
    r.push({
      id: t.id,
      izvor: t.ponavljajuciId ? "PONAVLJAJUCI" : "RUCNI",
      datum: dan(t.datum),
      kategorija: t.kategorija.naziv,
      opis: t.opis,
      iznos: c(t.iznos),
      placeno: t.placeno,
      veza: `/troskovi/${t.id}`,
    });
  for (const u of ulazni) {
    if (u.zaRobu && u.narudzbenicaId) continue; // ulazi u trošak robe narudžbenice
    r.push({
      id: u.id,
      izvor: "ULAZNI",
      datum: dan(u.datum),
      kategorija: u.zaRobu ? "Roba" : "Usluge",
      opis: `${u.interni} · ${u.dobavljac?.naziv ?? u.dobavljacTekst ?? ""} · ${u.broj}`,
      iznos: c(u.osnovica),
      placeno: c(u.placeno) >= c(u.ukupno),
      veza: `/ulazni/${u.id}`,
    });
  }
  for (const n of narudzbenice) {
    const t = trosakNarudzbenice({
      primke: n.primke.map((p) => ({ id: p.id, iznos: c(p.nabavnaVrijednost), aktivna: p.status === "IZDANA" })),
      racuni: n.ulazniRacuni
        .filter((x) => x.zaRobu)
        .map((x) => ({ id: x.id, iznos: c(x.osnovica), zaRobu: true, aktivan: ["EVIDENTIRAN", "PRIHVACEN"].includes(x.status) })),
    });
    if (t.roba)
      r.push({
        id: n.id,
        izvor: "NARUDZBENICA",
        datum: dan(n.datum),
        kategorija: "Roba",
        opis: `${n.broj} · ${n.dobavljac.naziv}`,
        iznos: t.roba,
        placeno: false,
        veza: `/nabava/${n.id}`,
      });
  }
  for (const p of primke)
    r.push({
      id: p.id,
      izvor: "PRIMKA",
      datum: dan(p.datum),
      kategorija: "Roba",
      opis: `Primka ${p.broj}`,
      iznos: c(p.nabavnaVrijednost),
      placeno: false,
      veza: `/primke/${p.id}`,
    });
  return r.sort((a, b) => b.datum.localeCompare(a.datum) || a.opis.localeCompare(b.opis, "hr"));
}
