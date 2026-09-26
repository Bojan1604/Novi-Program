import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { danas, datum as uDatum, dodajDane, jeDatum, usporedi } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import { pdvStatus, type PdvStatus } from "@/domain/partner";
import { imaPravo } from "@/domain/prava";
import type { KodKategorije } from "@/domain/pdv";
import {
  izracunajDokument,
  jeVrstaProdaje,
  PRETVORBE,
  provjeriStavku,
  provjeriZaIzdavanje,
  VRSTE_PRODAJE,
  type UlaznaStavka,
  type VrstaProdaje,
} from "@/domain/prodaja";
import { oznakaDokumenta } from "@/domain/zaprimanje";
import { GreskaKorisniku } from "@/lib/greske";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { brojRacuna, vrstaBrojacaRacuna } from "@/domain/numeracija";
import { provjeriOdobrenje, provjeriStorno } from "@/domain/odobrenja";
import { preostalo, provjeriPredujmove, type PreostaloPredujma } from "@/domain/predujam";
import { sljedeciBroj, sljedeciBrojSDatumom } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { fiskaliziraj, pripremiFiskalizaciju } from "./fiskalizacija";
import { najamSRacuna } from "./najam-racun";
import { promijeniStanje } from "./uredaji";

export type Tx = Prisma.TransactionClient;

/** Vlastita transakcija ili unutar postojeće (npr. izdavanje rata najma u jednoj transakciji). */
function uTransakciji<T>(db: PrismaClient | Tx, fn: (tx: Tx) => Promise<T>, opcije?: { timeout?: number }): Promise<T> {
  return "$transaction" in db ? (db as PrismaClient).$transaction(fn, opcije) : fn(db);
}

export const NAJVISE_STAVKI = 1000;
const d = (x: string) => new Date(`${x}T00:00:00Z`);
const datumIzBaze = (x: Date) => uDatum(x.toISOString().slice(0, 10));

export type UlazDokumenta = {
  vrsta: string;
  /** verzija nacrta koju je korisnik gledao (novi: 0) */
  verzija: number;
  partnerId: string | null;
  poslovnicaId: string | null;
  datum: string;
  vrijediDo: string | null;
  dospijece: string | null;
  popust: number;
  napomena: string | null;
  /** T, G, K, O (samo račun) */
  nacinPlacanja?: string;
  stavke: UlaznaStavka[];
};

export async function postavkeFirme(tx: Tx | PrismaClient, firmaId: string) {
  return tx.firma.findUniqueOrThrow({ where: { id: firmaId } });
}

/** Porezni status kupca za PDV (bez kupca = domaći, npr. građanin na blagajni). */
export function statusKupca(p: { drzava: string; pdvBroj: string | null; pdvStatus: string | null } | null): PdvStatus {
  return p ? pdvStatus(p.drzava, p.pdvBroj, p.pdvStatus) : "DOMACI";
}

async function provjeriReference(tx: Tx, firmaId: string, stavke: readonly UlaznaStavka[]) {
  const ids = (k: "uredajId" | "modelId" | "uslugaId") => [...new Set(stavke.map((s) => s[k]).filter((x): x is string => !!x))];
  for (const k of ["uredajId", "modelId", "uslugaId"] as const) if (!ids(k).every(jeUuid)) throw new GreskaKorisniku("Neispravan odabir u stavkama.");
  const [u, m, us] = await Promise.all([
    tx.uredaj.count({ where: { firmaId, id: { in: ids("uredajId") } } }),
    tx.modelUredaja.count({ where: { firmaId, id: { in: ids("modelId") } } }),
    tx.usluga.count({ where: { firmaId, id: { in: ids("uslugaId") } } }),
  ]);
  if (u !== ids("uredajId").length || m !== ids("modelId").length || us !== ids("uslugaId").length)
    throw new GreskaKorisniku("Neki uređaji, modeli ili usluge ne postoje.");
  const dupli = ids("uredajId").length !== stavke.filter((s) => s.uredajId).length;
  if (dupli) throw new GreskaKorisniku("Isti uređaj je na dokumentu dvaput.");
}

/**
 * Spremi nacrt (novi ili postojeći). Izdani dokument se ne može mijenjati.
 * Iznosi, kategorije PDV-a i zbrojevi računaju se ovdje (preglednik ih samo prikazuje).
 */
export async function spremiNacrt(
  db: PrismaClient | Tx,
  akter: Akter,
  id: string | null,
  ulaz: UlazDokumenta,
): Promise<{ id: string; verzija: number }> {
  if (!jeVrstaProdaje(ulaz.vrsta)) throw new GreskaKorisniku("Nepoznata vrsta dokumenta.");
  if (ulaz.vrsta === "ODOBRENJE" && !imaPravo(akter.prava, "prodaja", "puno"))
    throw new GreskaKorisniku("Odobrenje smije mijenjati samo korisnik s punim pravom prodaje.");
  if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Dokument ne postoji.");
  for (const x of [ulaz.partnerId, ulaz.poslovnicaId]) if (x !== null && !jeUuid(x)) throw new GreskaKorisniku("Neispravan odabir.");
  if (!jeDatum(ulaz.datum)) throw new GreskaKorisniku("Datum nije ispravan.");
  for (const [x, naziv] of [
    [ulaz.vrijediDo, "Vrijedi do"],
    [ulaz.dospijece, "Dospijeće"],
  ] as const) {
    if (x === null) continue;
    if (!jeDatum(x)) throw new GreskaKorisniku(`${naziv}: datum nije ispravan.`);
    if (usporedi(x, ulaz.datum) < 0) throw new GreskaKorisniku(`${naziv} ne smije biti prije datuma dokumenta.`);
  }
  if (!Number.isInteger(ulaz.popust) || ulaz.popust < 0 || ulaz.popust > 10000)
    throw new GreskaKorisniku("Popust dokumenta mora biti između 0 i 100 %.");
  if (ulaz.stavke.length > NAJVISE_STAVKI) throw new GreskaKorisniku(`Najviše ${NAJVISE_STAVKI} stavki.`);
  ulaz.stavke.forEach((s, i) => {
    const g = provjeriStavku(s, i, ulaz.vrsta === "ODOBRENJE");
    if (g) throw new GreskaKorisniku(g);
  });

  return uTransakciji(db, async (tx) => {
    const f = akter.firmaId;
    let stari: { id: string; verzija: number } | null = null;
    if (id) {
      await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${id}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
      const dok = await tx.prodajniDokument.findFirst({ where: { id, firmaId: f } });
      if (!dok) throw new GreskaKorisniku("Dokument ne postoji.");
      if (dok.status !== "NACRT") throw new GreskaKorisniku("Izdani dokument se ne može mijenjati.");
      if (dok.vrsta !== ulaz.vrsta) throw new GreskaKorisniku("Vrsta dokumenta se ne može mijenjati.");
      if (dok.verzija !== ulaz.verzija) throw new GreskaKorisniku("Netko je u međuvremenu promijenio ovaj dokument. Osvježite stranicu.");
      if (dok.vrsta === "ODOBRENJE") {
        // odobrenje: isti kupac kao račun, samo stavke izvornog računa
        if (ulaz.partnerId !== dok.partnerId) throw new GreskaKorisniku("Kupac na odobrenju mora biti isti kao na računu.");
        if (!dok.izvorId) throw new GreskaKorisniku("Odobrenje nema izvorni račun.");
        const izvorne = new Set(
          (await tx.stavkaProdajnogDokumenta.findMany({ where: { firmaId: f, dokumentId: dok.izvorId }, select: { id: true } })).map((x) => x.id),
        );
        if (ulaz.stavke.some((x) => !x.izvornaStavkaId || !izvorne.has(x.izvornaStavkaId)))
          throw new GreskaKorisniku("Na odobrenju mogu biti samo stavke izvornog računa.");
      }
      stari = dok;
    } else if (ulaz.vrsta === "ODOBRENJE" || ulaz.vrsta === "STORNO") {
      throw new GreskaKorisniku("Odobrenje se radi s izdanog računa.");
    }
    const partner = ulaz.partnerId
      ? await tx.partner.findFirst({
          where: { id: ulaz.partnerId, firmaId: f },
          select: { id: true, aktivan: true, kupac: true, drzava: true, pdvBroj: true, pdvStatus: true },
        })
      : null;
    if (ulaz.partnerId && (!partner || !partner.aktivan || !partner.kupac)) throw new GreskaKorisniku("Odaberite aktivnog kupca.");
    if (
      ulaz.poslovnicaId &&
      (!ulaz.partnerId || !(await tx.poslovnica.count({ where: { id: ulaz.poslovnicaId, firmaId: f, partnerId: ulaz.partnerId } })))
    )
      throw new GreskaKorisniku("Poslovnica ne pripada kupcu.");
    await provjeriReference(tx, f, ulaz.stavke);

    const firma = await postavkeFirme(tx, f);
    const r = izracunajDokument(await saIzvornimKategorijama(tx, f, ulaz.stavke), {
      firmaUSustavuPdv: firma.uSustavuPdv,
      pdvPoNaplacenoj: firma.pdvPoNaplacenoj,
      statusKupca: statusKupca(partner),
      popust: ulaz.popust,
    });
    const zaglavlje = {
      partnerId: ulaz.partnerId,
      poslovnicaId: ulaz.poslovnicaId,
      datum: d(ulaz.datum),
      vrijediDo: ulaz.vrijediDo ? d(ulaz.vrijediDo) : null,
      dospijece: ulaz.dospijece ? d(ulaz.dospijece) : null,
      popust: ulaz.popust,
      napomena: ulaz.napomena,
      nacinPlacanja: ["T", "G", "K", "O"].includes(ulaz.nacinPlacanja ?? "T") ? (ulaz.nacinPlacanja ?? "T") : "T",
      osnovica: centiUDecimal(r.zbrojevi.osnovica),
      pdv: centiUDecimal(r.zbrojevi.pdv),
      ukupno: centiUDecimal(r.zbrojevi.ukupno),
    };
    let dokId: string;
    let verzija: number;
    if (stari) {
      const u = await tx.prodajniDokument.update({ where: { id: stari.id }, data: { ...zaglavlje, verzija: { increment: 1 } } });
      await tx.stavkaProdajnogDokumenta.deleteMany({ where: { firmaId: f, dokumentId: stari.id } });
      dokId = u.id;
      verzija = u.verzija;
    } else {
      const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
      const n = await tx.prodajniDokument.create({
        data: { ...zaglavlje, firmaId: f, vrsta: ulaz.vrsta, korisnikId: akter.korisnikId, korisnik: ime },
      });
      dokId = n.id;
      verzija = n.verzija;
    }
    await tx.stavkaProdajnogDokumenta.createMany({
      data: r.stavke.map((s, i) => ({
        firmaId: f,
        dokumentId: dokId,
        redoslijed: i,
        vrsta: s.vrsta,
        namjena: s.namjena,
        uredajId: s.uredajId ?? null,
        modelId: s.modelId ?? null,
        uslugaId: s.uslugaId ?? null,
        naziv: s.naziv.trim(),
        opis: s.opis?.trim() || null,
        kpd: s.kpd || null,
        jedinica: s.jedinica || "kom",
        kolicina: s.kolicina,
        cijena: centiUDecimal(s.cijena),
        popust: s.popust,
        vrstaIsporuke: s.vrstaIsporuke,
        stopa: s.kategorija.stopa,
        kategorija: s.kategorija.kod,
        iznos: centiUDecimal(s.iznos),
        // veza na izvornu stavku samo za odobrenje i odbitak predujma
        izvornaStavkaId: ulaz.vrsta === "ODOBRENJE" || s.vrsta === "PREDUJAM" ? (s.izvornaStavkaId ?? null) : null,
      })),
    });
    if (!stari) {
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "prodaja.nacrt",
        entitet: "ProdajniDokument",
        entitetId: dokId,
        opis: `Novi nacrt: ${VRSTE_PRODAJE[ulaz.vrsta as VrstaProdaje].naziv.toLowerCase()}`,
      });
    }
    return { id: dokId, verzija };
  });
}

/** Snimka podataka firme i kupca za izdani dokument — kasnije promjene postavki ga ne mijenjaju. */
export async function snimkaDokumenta(tx: Tx, firmaId: string, partnerId: string | null, poslovnicaId: string | null, napomene: string[]) {
  const [firma, partner, poslovnica] = await Promise.all([
    postavkeFirme(tx, firmaId),
    partnerId ? tx.partner.findFirst({ where: { id: partnerId, firmaId } }) : null,
    poslovnicaId ? tx.poslovnica.findFirst({ where: { id: poslovnicaId, firmaId } }) : null,
  ]);
  return {
    firma: {
      naziv: firma.naziv,
      oib: firma.oib,
      adresa: firma.adresa,
      postanskiBroj: firma.postanskiBroj,
      mjesto: firma.mjesto,
      email: firma.email,
      telefon: firma.telefon,
      web: firma.web,
      iban: firma.iban,
      banka: firma.banka,
      uSustavuPdv: firma.uSustavuPdv,
      podnozje: firma.podnozje,
    },
    kupac: partner
      ? {
          naziv: partner.naziv,
          oib: partner.oib,
          pdvBroj: partner.pdvBroj,
          drzava: partner.drzava,
          adresa: partner.adresa,
          postanskiBroj: partner.postanskiBroj,
          mjesto: partner.mjesto,
          email: partner.email,
          eRacunAdresa: partner.eRacunAdresa,
        }
      : null,
    poslovnica: poslovnica
      ? { naziv: poslovnica.naziv, adresa: poslovnica.adresa, postanskiBroj: poslovnica.postanskiBroj, mjesto: poslovnica.mjesto }
      : null,
    napomene,
  };
}

/**
 * Stavke koje se pozivaju na izvornu stavku (odobrenje, odbitak predujma) dobivaju kategoriju i stopu PDV-a
 * izvorne stavke — ne računaju se prema današnjem statusu kupca i firme, i preglednik ih ne može promijeniti.
 */
export async function saIzvornimKategorijama<T extends UlaznaStavka>(tx: Tx | PrismaClient, firmaId: string, stavke: readonly T[]): Promise<T[]> {
  const ids = [...new Set(stavke.map((x) => x.izvornaStavkaId).filter((x): x is string => !!x && jeUuid(x)))];
  if (!ids.length) return [...stavke];
  const izvorne = new Map(
    (await tx.stavkaProdajnogDokumenta.findMany({ where: { firmaId, id: { in: ids } }, select: { id: true, kategorija: true, stopa: true } })).map(
      (x) => [x.id, x],
    ),
  );
  return stavke.map((x) => {
    const i = x.izvornaStavkaId ? izvorne.get(x.izvornaStavkaId) : undefined;
    return i ? { ...x, stopa: i.stopa, kategorijaIzvora: { kod: i.kategorija as KodKategorije, stopa: i.stopa } } : x;
  });
}

/** Napomene o PDV-u za spremljene stavke (iz kategorija). */
async function napomeneDokumenta(tx: Tx, firmaId: string, dokumentId: string, partner: Parameters<typeof statusKupca>[0], popust: number) {
  const firma = await postavkeFirme(tx, firmaId);
  const stavke = await tx.stavkaProdajnogDokumenta.findMany({ where: { firmaId, dokumentId }, orderBy: { redoslijed: "asc" } });
  return izracunajDokument(await saIzvornimKategorijama(tx, firmaId, stavke.map(uUlaznu)), {
    firmaUSustavuPdv: firma.uSustavuPdv,
    pdvPoNaplacenoj: firma.pdvPoNaplacenoj,
    statusKupca: statusKupca(partner),
    popust,
  }).napomene;
}

export function uUlaznu(s: {
  vrsta: string;
  namjena: string;
  uredajId: string | null;
  modelId: string | null;
  uslugaId: string | null;
  naziv: string;
  opis: string | null;
  kpd: string | null;
  jedinica: string;
  kolicina: number;
  cijena: Prisma.Decimal;
  popust: number;
  stopa: number;
  vrstaIsporuke: string;
  izvornaStavkaId?: string | null;
}): UlaznaStavka {
  return {
    vrsta: s.vrsta as UlaznaStavka["vrsta"],
    namjena: s.namjena as UlaznaStavka["namjena"],
    uredajId: s.uredajId,
    modelId: s.modelId,
    uslugaId: s.uslugaId,
    naziv: s.naziv,
    opis: s.opis,
    kpd: s.kpd,
    jedinica: s.jedinica,
    kolicina: s.kolicina,
    cijena: centiIzDecimala(s.cijena.toFixed(2)),
    popust: s.popust,
    stopa: s.stopa,
    vrstaIsporuke: s.vrstaIsporuke as UlaznaStavka["vrstaIsporuke"],
    izvornaStavkaId: s.izvornaStavkaId ?? null,
  };
}

/** Izdavanje ponude ili predračuna: broj (PON-3/2026), snimka postavki, zaključavanje. Račun: `izdajRacun` (korak 2.4). */
export async function izdajPonudu(db: PrismaClient, akter: Akter, id: string, sada = new Date()): Promise<{ broj: string }> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Dokument ne postoji.");
  return db.$transaction(async (tx) => {
    const f = akter.firmaId;
    await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${id}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const dok = await tx.prodajniDokument.findFirst({
      where: { id, firmaId: f },
      include: { partner: { select: { drzava: true, pdvBroj: true, pdvStatus: true } }, _count: { select: { stavke: true } } },
    });
    if (!dok) throw new GreskaKorisniku("Dokument ne postoji.");
    if (dok.vrsta === "RACUN") throw new GreskaKorisniku("Račun se izdaje posebno.");
    if (dok.status !== "NACRT") throw new GreskaKorisniku("Dokument je već izdan.");
    if (!dok.partnerId) throw new GreskaKorisniku("Odaberite kupca.");
    if (dok._count.stavke === 0) throw new GreskaKorisniku("Dodajte barem jednu stavku.");
    const datum = datumIzBaze(dok.datum);
    if (usporedi(datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum ne smije biti u budućnosti.");
    const v = VRSTE_PRODAJE[dok.vrsta as VrstaProdaje];
    const godina = Number(datum.slice(0, 4));
    const redni = await sljedeciBroj(tx, f, v.brojac, godina);
    const broj = oznakaDokumenta(v.prefiks, redni, godina);
    const napomene = await napomeneDokumenta(tx, f, id, dok.partner, dok.popust);
    await tx.prodajniDokument.update({
      where: { id },
      data: {
        status: "IZDAN",
        broj,
        godina,
        redni,
        izdano: sada,
        snimka: await snimkaDokumenta(tx, f, dok.partnerId, dok.poslovnicaId, napomene),
        verzija: { increment: 1 },
      },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "prodaja.izdaj",
      entitet: "ProdajniDokument",
      entitetId: id,
      opis: `Izdan dokument ${v.naziv.toLowerCase()} ${broj} (${dok.ukupno.toFixed(2)} €)`,
    });
    return { broj };
  });
}

/**
 * Pretvaranje (ponuda → predračun/račun, predračun → račun): novi nacrt s ISTIM stavkama, cijenama i popustima.
 * Datum je današnji, dospijeće prema roku plaćanja kupca.
 */
export async function pretvori(db: PrismaClient, akter: Akter, izvorId: string, u: string, sada = new Date()): Promise<{ id: string }> {
  if (!jeUuid(izvorId) || !jeVrstaProdaje(u)) throw new GreskaKorisniku("Dokument ne postoji.");
  return db.$transaction(async (tx) => {
    const f = akter.firmaId;
    await zakljucajKljuc(tx, `pretvori:${izvorId}`);
    const izvor = await tx.prodajniDokument.findFirst({
      where: { id: izvorId, firmaId: f },
      include: { stavke: { orderBy: { redoslijed: "asc" } }, partner: { select: { rokPlacanjaDana: true } } },
    });
    if (!izvor) throw new GreskaKorisniku("Dokument ne postoji.");
    if (!PRETVORBE[izvor.vrsta as VrstaProdaje]?.includes(u)) throw new GreskaKorisniku("Ovaj dokument se ne može pretvoriti u odabranu vrstu.");
    const postoji = await tx.prodajniDokument.findFirst({
      where: { firmaId: f, izvorId, vrsta: u, status: { not: "STORNIRAN" } },
      select: { id: true },
    });
    if (postoji) return { id: postoji.id };
    const firma = await postavkeFirme(tx, f);
    const datum = danas(sada);
    const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    const novi = await tx.prodajniDokument.create({
      data: {
        firmaId: f,
        vrsta: u,
        datum: d(datum),
        dospijece: u === "PONUDA" ? null : d(dodajDane(datum, izvor.partner?.rokPlacanjaDana ?? firma.rokPlacanjaDana)),
        partnerId: izvor.partnerId,
        poslovnicaId: izvor.poslovnicaId,
        popust: izvor.popust,
        napomena: izvor.napomena,
        osnovica: izvor.osnovica,
        pdv: izvor.pdv,
        ukupno: izvor.ukupno,
        izvorId,
        korisnikId: akter.korisnikId,
        korisnik: ime,
      },
    });
    await tx.stavkaProdajnogDokumenta.createMany({
      data: izvor.stavke.map(({ id: _id, dokumentId: _d, ...s }) => ({ ...s, dokumentId: novi.id })),
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "prodaja.pretvori",
      entitet: "ProdajniDokument",
      entitetId: novi.id,
      opis: `${VRSTE_PRODAJE[u].naziv} iz dokumenta ${izvor.broj ?? "(nacrt)"}`,
    });
    return { id: novi.id };
  });
}

export async function obrisiNacrt(db: PrismaClient, akter: Akter, id: string): Promise<void> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Dokument ne postoji.");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${id}::uuid AND "firmaId" = ${akter.firmaId}::uuid FOR UPDATE`;
    const dok = await tx.prodajniDokument.findFirst({ where: { id, firmaId: akter.firmaId } });
    if (!dok) throw new GreskaKorisniku("Dokument ne postoji.");
    if (dok.status !== "NACRT") throw new GreskaKorisniku("Izdani dokument se ne može obrisati.");
    await tx.stavkaProdajnogDokumenta.deleteMany({ where: { firmaId: akter.firmaId, dokumentId: id } });
    await tx.prodajniDokument.delete({ where: { id } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "prodaja.obrisiNacrt",
      entitet: "ProdajniDokument",
      entitetId: id,
      opis: `Obrisan nacrt (${VRSTE_PRODAJE[dok.vrsta as VrstaProdaje]?.naziv ?? dok.vrsta})`,
    });
  });
}

/** Cijene stavki za kupca (pri promjeni kupca na nacrtu): cjenik → popust cjenika → preporučena. */
export { cijenaZaKupca } from "./partneri";

export { NACINI_PLACANJA } from "@/domain/prodaja";

/**
 * Izdavanje računa: broj redni/prostor/uređaj (bez rupa, datumi po pravilima), KPD na svakoj stavci,
 * uređaji istog modela spojeni u jednu stavku, prodani uređaji prelaze u „Prodan“ kroz jedino pravilo prijelaza,
 * snimka postavki firme — kasnija promjena postavki ne mijenja izdani račun.
 */
export async function izdajRacun(db: PrismaClient, akter: Akter, id: string, sada = new Date()): Promise<{ broj: string; fiskal: string | null }> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Račun ne postoji.");
  const { broj, fiskalizirati } = await izdajRacunUBazi(db, akter, id, sada);
  return { broj, fiskal: fiskalizirati ? await porukaFiskalizacije(db, akter.firmaId, id, sada) : null };
}

/** Nakon izdavanja: slanje CIS-u; greška ne poništava račun (naknadna dostava). */
export async function porukaFiskalizacije(db: PrismaClient, firmaId: string, id: string, sada: Date): Promise<string> {
  const f = await fiskaliziraj(db, firmaId, id, sada);
  return "jir" in f ? "Fiskaliziran." : `Fiskalizacija nije uspjela (${f.greska}) — ponovit će se automatski.`;
}

/** Izdavanje bez slanja CIS-u (poziva se i unutar tuđe transakcije; slanje nakon nje: `porukaFiskalizacije`). */
export async function izdajRacunUBazi(
  db: PrismaClient | Tx,
  akter: Akter,
  id: string,
  sada: Date,
): Promise<{ broj: string; fiskalizirati: boolean }> {
  return uTransakciji(
    db,
    async (tx) => {
      const f = akter.firmaId;
      await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${id}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
      const dok = await tx.prodajniDokument.findFirst({
        where: { id, firmaId: f },
        include: {
          partner: { select: { drzava: true, pdvBroj: true, pdvStatus: true, aktivan: true, oib: true } },
          stavke: { orderBy: { redoslijed: "asc" }, include: { uredaj: { select: { serijski: true } } } },
        },
      });
      if (!dok) throw new GreskaKorisniku("Račun ne postoji.");
      if (!["RACUN", "ODOBRENJE", "PREDUJAM"].includes(dok.vrsta)) throw new GreskaKorisniku("Ovo nije račun.");
      if (dok.vrsta === "ODOBRENJE" && !imaPravo(akter.prava, "prodaja", "puno"))
        throw new GreskaKorisniku("Odobrenje smije izdati samo korisnik s punim pravom prodaje.");
      if (dok.vrsta === "PREDUJAM" && dok.stavke.some((s) => s.uredajId || s.vrsta === "PREDUJAM"))
        throw new GreskaKorisniku("Račun za predujam ne sadrži uređaje ni odbitke predujma.");
      if (dok.status !== "NACRT") throw new GreskaKorisniku("Račun je već izdan.");
      if (dok.stavke.length === 0) throw new GreskaKorisniku("Dodajte barem jednu stavku.");
      const jeOdobrenje = dok.vrsta === "ODOBRENJE";
      const prodaniUredaji = dok.vrsta !== "RACUN" ? [] : dok.stavke.filter((s) => s.uredajId && s.namjena === "PRODAJA").map((s) => s.uredajId!);
      const vraceniUredaji = jeOdobrenje ? dok.stavke.filter((s) => s.uredajId && s.namjena === "PRODAJA").map((s) => s.uredajId!) : [];
      if (prodaniUredaji.length && !dok.partnerId) throw new GreskaKorisniku("Za prodaju uređaja odaberite kupca.");

      const firma = await postavkeFirme(tx, f);
      const r = izracunajDokument(
        await saIzvornimKategorijama(
          tx,
          f,
          dok.stavke.map((s) => ({ ...uUlaznu(s), serijskiBroj: s.uredaj?.serijski ?? null })),
        ),
        { firmaUSustavuPdv: firma.uSustavuPdv, pdvPoNaplacenoj: firma.pdvPoNaplacenoj, statusKupca: statusKupca(dok.partner), popust: dok.popust },
      );
      const kpd = provjeriZaIzdavanje(r.grupirane);
      if (kpd) throw new GreskaKorisniku(kpd);
      const predujmovi = dok.stavke.filter((s) => s.vrsta === "PREDUJAM");
      if (predujmovi.length) {
        if (dok.vrsta !== "RACUN") throw new GreskaKorisniku("Predujam se odbija samo na konačnom računu.");
        const g = provjeriPredujmove({
          stavke: r.grupirane.filter((s) => s.vrsta === "PREDUJAM").map((s) => ({ izvornaStavkaId: s.izvornaStavkaId ?? null, iznos: s.iznos })),
          dostupno: await dostupniPredujmovi(tx, f, dok.partnerId, id, true),
          ukupnoRacuna: r.zbrojevi.ukupno,
        });
        if (g) throw new GreskaKorisniku(g);
      }
      if (jeOdobrenje) {
        // izvorni račun zaključan dok se izdaje odobrenje — dvije kartice ne mogu zajedno prijeći iznos računa
        if (!dok.izvorId) throw new GreskaKorisniku("Odobrenje nema izvorni račun.");
        await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${dok.izvorId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
        const izvor = await tx.prodajniDokument.findFirstOrThrow({
          where: { id: dok.izvorId, firmaId: f },
          include: { stavke: { select: { id: true, naziv: true, kolicina: true, iznos: true } } },
        });
        if (izvor.status !== "IZDAN") throw new GreskaKorisniku("Izvorni račun je storniran — odobrenje nije moguće.");
        // vraćeni uređaj mora biti prodan baš na toj stavci izvornog računa i ne smije biti već vraćen
        if (vraceniUredaji.length) {
          const naIzvoru = await tx.uredajNaStavci.findMany({
            where: { firmaId: f, stavka: { dokumentId: izvor.id } },
            select: { uredajId: true, stavkaId: true },
          });
          const stavkaUredaja = new Map(naIzvoru.map((x) => [x.uredajId, x.stavkaId]));
          for (const s of dok.stavke.filter((x) => x.uredajId && x.namjena === "PRODAJA")) {
            if (stavkaUredaja.get(s.uredajId!) !== s.izvornaStavkaId)
              throw new GreskaKorisniku(`Uređaj ${s.uredaj?.serijski ?? ""} nije prodan na toj stavci izvornog računa.`);
          }
          const vecVraceno = await tx.uredajNaStavci.count({
            where: {
              firmaId: f,
              uredajId: { in: vraceniUredaji },
              stavka: { dokument: { izvorId: izvor.id, vrsta: "ODOBRENJE", status: "IZDAN" } },
            },
          });
          if (vecVraceno) throw new GreskaKorisniku("Neki od uređaja već su vraćeni ranijim odobrenjem.");
        }
        const ranija = await tx.prodajniDokument.findMany({
          where: { firmaId: f, izvorId: izvor.id, vrsta: "ODOBRENJE", status: "IZDAN" },
          select: { ukupno: true, stavke: { select: { izvornaStavkaId: true, kolicina: true, iznos: true } } },
        });
        const c = (x: Prisma.Decimal) => centiIzDecimala(x.toFixed(2));
        const g = provjeriOdobrenje({
          izvorne: izvor.stavke.map((x) => ({ id: x.id, naziv: x.naziv, kolicina: x.kolicina, iznos: c(x.iznos) })),
          izvorUkupno: c(izvor.ukupno),
          vecOdobreno: ranija.flatMap((o) => o.stavke.map((x) => ({ izvornaStavkaId: x.izvornaStavkaId, kolicina: x.kolicina, iznos: c(x.iznos) }))),
          vecOdobrenoUkupno: ranija.reduce((a, o) => a + c(o.ukupno), 0),
          nove: r.grupirane.map((x) => ({ izvornaStavkaId: x.izvornaStavkaId ?? null, kolicina: x.kolicina, iznos: x.iznos })),
          ukupno: r.zbrojevi.ukupno,
        });
        if (g) throw new GreskaKorisniku(g);
      }

      const datum = datumIzBaze(dok.datum);
      const redni = await sljedeciBrojSDatumom(tx, f, vrstaBrojacaRacuna("racun", firma.oznakaProstora, firma.oznakaUredaja), {
        datum,
        dospijece: dok.dospijece ? datumIzBaze(dok.dospijece) : null,
        danas: danas(sada),
      });
      const broj = brojRacuna(redni, firma.oznakaProstora, firma.oznakaUredaja);

      if (prodaniUredaji.length) {
        await promijeniStanje(tx, { firmaId: f, korisnikId: akter.korisnikId }, prodaniUredaji, "prodaja", {
          partnerId: dok.partnerId,
          poslovnicaId: dok.poslovnicaId,
          dokument: { vrsta: "Račun", id, broj },
        });
      }
      if (vraceniUredaji.length) {
        const skladiste = await tx.skladiste.findFirst({
          where: { firmaId: f, aktivan: true },
          orderBy: [{ zadano: "desc" }, { naziv: "asc" }],
          select: { id: true },
        });
        if (!skladiste) throw new GreskaKorisniku("Nema aktivnog skladišta za vraćene uređaje.");
        await promijeniStanje(tx, { firmaId: f, korisnikId: akter.korisnikId }, vraceniUredaji, "stornoProdaje", {
          skladisteId: skladiste.id,
          dokument: { vrsta: "Odobrenje", id, broj },
        });
      }

      // stavke kakve će biti na računu (grupirane) + veza uređaja na stavku
      await tx.stavkaProdajnogDokumenta.deleteMany({ where: { firmaId: f, dokumentId: id } });
      for (const [i, s] of r.grupirane.entries()) {
        const nova = await tx.stavkaProdajnogDokumenta.create({
          data: {
            firmaId: f,
            dokumentId: id,
            redoslijed: i,
            vrsta: s.vrsta,
            namjena: s.namjena,
            uredajId: s.uredajIds.length === 1 ? s.uredajIds[0]! : null,
            modelId: s.modelId ?? null,
            uslugaId: s.uslugaId ?? null,
            naziv: s.naziv,
            opis: s.opis ?? null,
            kpd: s.kpd ?? null,
            jedinica: s.jedinica,
            kolicina: s.kolicina,
            cijena: centiUDecimal(s.cijena),
            popust: s.popust,
            vrstaIsporuke: s.vrstaIsporuke,
            stopa: s.kategorija.stopa,
            kategorija: s.kategorija.kod,
            iznos: centiUDecimal(s.iznos),
            izvornaStavkaId: s.izvornaStavkaId ?? null,
          },
          select: { id: true },
        });
        if (s.uredajIds.length)
          await tx.uredajNaStavci.createMany({ data: s.uredajIds.map((uredajId) => ({ firmaId: f, stavkaId: nova.id, uredajId })) });
      }
      // najam uređaja na računu iz prodaje: ugovor (postojeći ili novi) i rata za mjesec računa
      const ugovorNajmaId =
        dok.vrsta === "RACUN"
          ? await najamSRacuna(tx, akter, {
              dokumentId: id,
              broj,
              datum,
              partnerId: dok.partnerId,
              poslovnicaId: dok.poslovnicaId,
              ugovorNajmaId: dok.ugovorNajmaId,
              nacinPlacanja: dok.nacinPlacanja,
              stavke: r.grupirane.filter((s) => s.namjena === "NAJAM").map((s) => ({ uredajIds: s.uredajIds, iznos: s.iznos })),
            })
          : null;
      const snimka = {
        ...(await snimkaDokumenta(tx, f, dok.partnerId, dok.poslovnicaId, r.napomene)),
        racun: {
          oznakaProstora: firma.oznakaProstora,
          oznakaUredaja: firma.oznakaUredaja,
          nacinPlacanja: dok.nacinPlacanja,
          pdvPoNaplacenoj: firma.pdvPoNaplacenoj,
          operater: (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "",
          poKategoriji: r.zbrojevi.poKategoriji,
        },
      };
      const fiskal = await pripremiFiskalizaciju(tx, {
        firma,
        korisnikId: akter.korisnikId,
        vrsta: dok.vrsta,
        nacinPlacanja: dok.nacinPlacanja,
        kupacImaOib: !!dok.partner?.oib,
        redni,
        ukupno: r.zbrojevi.ukupno,
        vrijeme: sada,
      });
      await tx.prodajniDokument.update({
        where: { id },
        data: {
          status: "IZDAN",
          broj,
          ...(ugovorNajmaId ? { ugovorNajmaId } : {}),
          godina: Number(datum.slice(0, 4)),
          redni,
          izdano: sada,
          snimka,
          ...fiskal,
          osnovica: centiUDecimal(r.zbrojevi.osnovica),
          pdv: centiUDecimal(r.zbrojevi.pdv),
          ukupno: centiUDecimal(r.zbrojevi.ukupno),
          verzija: { increment: 1 },
        },
      });
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "prodaja.izdajRacun",
        entitet: "ProdajniDokument",
        entitetId: id,
        opis: `Izdan${jeOdobrenje ? "o odobrenje" : " račun"} ${broj} (${(r.zbrojevi.ukupno / 100).toFixed(2)} €, uređaja: ${prodaniUredaji.length})${fiskal.zki ? `, ZKI ${fiskal.zki}` : ""}`,
      });
      return { broj, fiskalizirati: fiskal.fiskalStatus === "CEKA" };
    },
    { timeout: 60_000 },
  );
}

/**
 * Nacrt odobrenja iz izdanog računa: sve stavke s negativnom količinom, uređaji svaki u svom retku
 * (korisnik uklanja ono što se ne vraća / smanjuje količinu). Iznos se provjerava tek pri izdavanju.
 */
export async function napraviOdobrenje(db: PrismaClient, akter: Akter, racunId: string, sada = new Date()): Promise<{ id: string }> {
  if (!jeUuid(racunId)) throw new GreskaKorisniku("Račun ne postoji.");
  return db.$transaction(async (tx) => {
    const f = akter.firmaId;
    const r = await tx.prodajniDokument.findFirst({
      where: { id: racunId, firmaId: f },
      include: {
        stavke: { orderBy: { redoslijed: "asc" }, include: { uredaji: { include: { uredaj: { select: { id: true, serijski: true } } } } } },
      },
    });
    if (!r || r.vrsta !== "RACUN") throw new GreskaKorisniku("Račun ne postoji.");
    if (r.status !== "IZDAN") throw new GreskaKorisniku("Odobrenje se radi samo za izdani račun.");
    // odbitak predujma se ne odobrava (predujam ostaje iskorišten; za cijeli račun koristite storno)
    const stavke: UlaznaStavka[] = r.stavke
      .filter((s) => s.vrsta !== "PREDUJAM")
      .flatMap((s) => {
        const osnova = { ...uUlaznu(s), izvornaStavkaId: s.id, uredajId: null as string | null };
        if (s.uredaji.length) {
          return s.uredaji
            .map((x) => x.uredaj)
            .sort((a, b) => a.serijski.localeCompare(b.serijski))
            .map((u) => ({ ...osnova, uredajId: u.id, kolicina: -1000, opis: `S/N: ${u.serijski}` }));
        }
        return [{ ...osnova, uredajId: s.uredajId, kolicina: -s.kolicina }];
      });
    const firma = await postavkeFirme(tx, f);
    const partner = r.partnerId
      ? await tx.partner.findFirst({ where: { id: r.partnerId, firmaId: f }, select: { drzava: true, pdvBroj: true, pdvStatus: true } })
      : null;
    const izr = izracunajDokument(await saIzvornimKategorijama(tx, f, stavke), {
      firmaUSustavuPdv: firma.uSustavuPdv,
      pdvPoNaplacenoj: firma.pdvPoNaplacenoj,
      statusKupca: statusKupca(partner),
      popust: r.popust,
    });
    const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    const dat = danas(sada);
    const n = await tx.prodajniDokument.create({
      data: {
        firmaId: f,
        vrsta: "ODOBRENJE",
        datum: d(dat),
        dospijece: d(dat),
        partnerId: r.partnerId,
        poslovnicaId: r.poslovnicaId,
        popust: r.popust,
        nacinPlacanja: r.nacinPlacanja,
        napomena: `Odobrenje za račun ${r.broj}`,
        osnovica: centiUDecimal(izr.zbrojevi.osnovica),
        pdv: centiUDecimal(izr.zbrojevi.pdv),
        ukupno: centiUDecimal(izr.zbrojevi.ukupno),
        izvorId: r.id,
        korisnikId: akter.korisnikId,
        korisnik: ime,
      },
    });
    await tx.stavkaProdajnogDokumenta.createMany({
      data: izr.stavke.map((s, i) => ({
        firmaId: f,
        dokumentId: n.id,
        redoslijed: i,
        vrsta: s.vrsta,
        namjena: s.namjena,
        uredajId: s.uredajId ?? null,
        modelId: s.modelId ?? null,
        uslugaId: s.uslugaId ?? null,
        naziv: s.naziv,
        opis: s.opis ?? null,
        kpd: s.kpd ?? null,
        jedinica: s.jedinica,
        kolicina: s.kolicina,
        cijena: centiUDecimal(s.cijena),
        popust: s.popust,
        vrstaIsporuke: s.vrstaIsporuke,
        stopa: s.kategorija.stopa,
        kategorija: s.kategorija.kod,
        iznos: centiUDecimal(s.iznos),
        izvornaStavkaId: s.izvornaStavkaId ?? null,
      })),
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "prodaja.odobrenje",
      entitet: "ProdajniDokument",
      entitetId: n.id,
      opis: `Nacrt odobrenja za račun ${r.broj}`,
    });
    return { id: n.id };
  });
}

/**
 * Storno računa: novi dokument u istom nizu brojeva s negativnim stavkama, izvorni račun „storniran“,
 * prodani uređaji vraćaju se na odabrano skladište. Uplate po stornom računu postaju „za povrat“.
 */
export async function stornirajRacun(
  db: PrismaClient,
  akter: Akter,
  racunId: string,
  skladisteId: string,
  sada = new Date(),
): Promise<{ id: string; broj: string; fiskal: string | null }> {
  if (!jeUuid(racunId)) throw new GreskaKorisniku("Račun ne postoji.");
  if (!jeUuid(skladisteId)) throw new GreskaKorisniku("Odaberite skladište za vraćene uređaje.");
  const s = await stornirajUBazi(db, akter, racunId, skladisteId, sada);
  return { id: s.id, broj: s.broj, fiskal: s.fiskalizirati ? await porukaFiskalizacije(db, akter.firmaId, s.id, sada) : null };
}

async function stornirajUBazi(db: PrismaClient, akter: Akter, racunId: string, skladisteId: string, sada: Date) {
  return db.$transaction(
    async (tx) => {
      const f = akter.firmaId;
      await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${racunId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
      const r = await tx.prodajniDokument.findFirst({
        where: { id: racunId, firmaId: f },
        include: {
          stavke: { orderBy: { redoslijed: "asc" }, include: { uredaji: { select: { uredajId: true } } } },
          partner: { select: { oib: true } },
        },
      });
      if (!r) throw new GreskaKorisniku("Račun ne postoji.");
      const brojOdobrenja = await tx.prodajniDokument.count({ where: { firmaId: f, izvorId: r.id, vrsta: "ODOBRENJE", status: "IZDAN" } });
      const predujamIskoristen =
        r.vrsta === "PREDUJAM" &&
        (await tx.stavkaProdajnogDokumenta.count({
          where: { firmaId: f, vrsta: "PREDUJAM", izvornaStavkaId: { in: r.stavke.map((x) => x.id) }, dokument: { vrsta: "RACUN", status: "IZDAN" } },
        })) > 0;
      const g = provjeriStorno({ vrsta: r.vrsta, status: r.status, brojOdobrenja, predujamIskoristen });
      if (g) throw new GreskaKorisniku(g);
      const skl = await tx.skladiste.findFirst({ where: { id: skladisteId, firmaId: f, aktivan: true } });
      if (!skl) throw new GreskaKorisniku("Odaberite aktivno skladište.");

      const firma = await postavkeFirme(tx, f);
      const dat = danas(sada);
      const redni = await sljedeciBrojSDatumom(tx, f, vrstaBrojacaRacuna("racun", firma.oznakaProstora, firma.oznakaUredaja), {
        datum: dat,
        danas: dat,
      });
      const broj = brojRacuna(redni, firma.oznakaProstora, firma.oznakaUredaja);
      const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
      const neg = (x: Prisma.Decimal) => x.negated();
      const snimka = (r.snimka as { racun?: object } | null) ?? {};
      // storno se fiskalizira ako je fiskaliziran izvorni račun (isti način plaćanja, iznosi s minusom)
      const fiskal =
        r.fiskalStatus && r.fiskalStatus !== "NIJE_POTREBNO"
          ? await pripremiFiskalizaciju(tx, {
              firma,
              korisnikId: akter.korisnikId,
              vrsta: "STORNO",
              nacinPlacanja: r.nacinPlacanja,
              kupacImaOib: !!r.partner?.oib,
              redni,
              ukupno: -centiIzDecimala(r.ukupno.toFixed(2)),
              vrijeme: sada,
            })
          : { fiskalStatus: "NIJE_POTREBNO" };
      const storno = await tx.prodajniDokument.create({
        data: {
          firmaId: f,
          vrsta: "STORNO",
          status: "IZDAN",
          broj,
          godina: Number(dat.slice(0, 4)),
          redni,
          datum: d(dat),
          dospijece: d(dat),
          partnerId: r.partnerId,
          poslovnicaId: r.poslovnicaId,
          popust: r.popust,
          nacinPlacanja: r.nacinPlacanja,
          napomena: `Storno računa ${r.broj}`,
          osnovica: neg(r.osnovica),
          pdv: neg(r.pdv),
          ukupno: neg(r.ukupno),
          izvorId: r.id,
          izdano: sada,
          snimka: { ...snimka, ...(snimka.racun ? { racun: { ...snimka.racun, operater: ime } } : {}), stornoRacuna: r.broj },
          korisnikId: akter.korisnikId,
          korisnik: ime,
          ...fiskal,
        },
      });
      for (const s of r.stavke) {
        const { id: izvornaId, dokumentId: _d, uredaji, ...ostalo } = s;
        const nova = await tx.stavkaProdajnogDokumenta.create({
          data: { ...ostalo, dokumentId: storno.id, kolicina: -s.kolicina, iznos: neg(s.iznos), izvornaStavkaId: izvornaId },
          select: { id: true },
        });
        if (uredaji.length)
          await tx.uredajNaStavci.createMany({ data: uredaji.map((u) => ({ firmaId: f, stavkaId: nova.id, uredajId: u.uredajId })) });
      }
      const prodani = r.stavke.filter((s) => s.namjena === "PRODAJA").flatMap((s) => s.uredaji.map((u) => u.uredajId));
      if (prodani.length) {
        await promijeniStanje(tx, { firmaId: f, korisnikId: akter.korisnikId }, prodani, "stornoProdaje", {
          skladisteId: skl.id,
          dokument: { vrsta: "Storno", id: storno.id, broj },
          opis: `Storno računa ${r.broj}`,
        });
      }
      await tx.prodajniDokument.update({ where: { id: r.id }, data: { status: "STORNIRAN", verzija: { increment: 1 } } });
      // rate najma s tog računa ponovno su za izdati
      await tx.rataNajma.deleteMany({ where: { firmaId: f, dokumentId: r.id } });
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "prodaja.storno",
        entitet: "ProdajniDokument",
        entitetId: r.id,
        opis: `Storniran račun ${r.broj} stornom ${broj} (uređaja vraćeno: ${prodani.length})`,
        staro: { status: "IZDAN" },
        novo: { status: "STORNIRAN" },
      });
      return { id: storno.id, broj, fiskalizirati: fiskal.fiskalStatus === "CEKA" };
    },
    { timeout: 60_000 },
  );
}

/**
 * Stavke izdanih računa za predujam kupca i koliko je od svake već odbijeno na izdanim konačnim računima.
 * `zakljucaj`: računi za predujam zaključani do kraja transakcije (dva konačna računa ne mogu isti predujam odbiti dvaput).
 */
export async function dostupniPredujmovi(
  tx: Tx | PrismaClient,
  firmaId: string,
  partnerId: string | null,
  osimRacuna: string | null,
  zakljucaj = false,
): Promise<(PreostaloPredujma & { dokumentId: string; broj: string; stopa: number; kpd: string | null; vrstaIsporuke: string })[]> {
  if (!partnerId) return [];
  const predujmovi = await tx.prodajniDokument.findMany({
    where: { firmaId, partnerId, vrsta: "PREDUJAM", status: "IZDAN" },
    orderBy: { datum: "asc" },
    select: { id: true, broj: true, stavke: { select: { id: true, naziv: true, iznos: true, stopa: true, kpd: true, vrstaIsporuke: true } } },
  });
  if (!predujmovi.length) return [];
  if (zakljucaj) {
    const ids = predujmovi.map((p) => p.id);
    await (tx as Tx)
      .$queryRaw`SELECT id FROM "ProdajniDokument" WHERE "firmaId" = ${firmaId}::uuid AND id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
  }
  const stavkeIds = predujmovi.flatMap((p) => p.stavke.map((s) => s.id));
  const iskoristeno = await tx.stavkaProdajnogDokumenta.groupBy({
    by: ["izvornaStavkaId"],
    where: {
      firmaId,
      vrsta: "PREDUJAM",
      izvornaStavkaId: { in: stavkeIds },
      dokument: { status: "IZDAN", vrsta: "RACUN", ...(osimRacuna ? { id: { not: osimRacuna } } : {}) },
    },
    _sum: { iznos: true },
  });
  const mapa = new Map(iskoristeno.map((x) => [x.izvornaStavkaId, Math.abs(centiIzDecimala((x._sum.iznos ?? 0).toString()))]));
  return predujmovi.flatMap((p) =>
    p.stavke.map((s) => ({
      dokumentId: p.id,
      broj: p.broj ?? "",
      stavkaId: s.id,
      naziv: `Predujam po računu ${p.broj}${p.stavke.length > 1 ? ` (${s.naziv})` : ""}`,
      osnovica: centiIzDecimala(s.iznos.toFixed(2)),
      iskoristeno: mapa.get(s.id) ?? 0,
      stopa: s.stopa,
      kpd: s.kpd,
      vrstaIsporuke: s.vrstaIsporuke,
    })),
  );
}

/** Na nacrt konačnog računa dodaje odbitak predujma (preostali iznos svake stavke predujma). */
export async function dodajPredujam(db: PrismaClient, akter: Akter, racunId: string, predujamId: string): Promise<void> {
  if (!jeUuid(racunId) || !jeUuid(predujamId)) throw new GreskaKorisniku("Dokument ne postoji.");
  await db.$transaction(async (tx) => {
    const f = akter.firmaId;
    await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${racunId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const r = await tx.prodajniDokument.findFirst({
      where: { id: racunId, firmaId: f },
      include: { stavke: { orderBy: { redoslijed: "asc" } }, partner: { select: { drzava: true, pdvBroj: true, pdvStatus: true } } },
    });
    if (!r || r.vrsta !== "RACUN" || r.status !== "NACRT") throw new GreskaKorisniku("Predujam se dodaje na nacrt računa.");
    const dostupno = (await dostupniPredujmovi(tx, f, r.partnerId, r.id)).filter((x) => x.dokumentId === predujamId);
    if (!dostupno.length) throw new GreskaKorisniku("Račun za predujam ne postoji ili nije ovog kupca.");
    const vec = new Set(r.stavke.filter((s) => s.vrsta === "PREDUJAM").map((s) => s.izvornaStavkaId));
    const nove: UlaznaStavka[] = dostupno
      .filter((x) => !vec.has(x.stavkaId) && preostalo(x) > 0)
      .map((x) => ({
        vrsta: "PREDUJAM",
        namjena: "PRODAJA",
        naziv: x.naziv,
        kpd: x.kpd,
        jedinica: "kom",
        kolicina: -1000,
        cijena: preostalo(x),
        popust: 0,
        stopa: x.stopa,
        vrstaIsporuke: x.vrstaIsporuke as UlaznaStavka["vrstaIsporuke"],
        izvornaStavkaId: x.stavkaId,
      }));
    if (!nove.length) throw new GreskaKorisniku("Taj predujam je već iskorišten ili dodan na račun.");
    const firma = await postavkeFirme(tx, f);
    const sve = [...r.stavke.map(uUlaznu), ...nove];
    const izr = izracunajDokument(await saIzvornimKategorijama(tx, f, sve), {
      firmaUSustavuPdv: firma.uSustavuPdv,
      pdvPoNaplacenoj: firma.pdvPoNaplacenoj,
      statusKupca: statusKupca(r.partner),
      popust: r.popust,
    });
    await tx.stavkaProdajnogDokumenta.createMany({
      data: izr.stavke.slice(r.stavke.length).map((s, i) => ({
        firmaId: f,
        dokumentId: r.id,
        redoslijed: r.stavke.length + i,
        vrsta: s.vrsta,
        namjena: s.namjena,
        naziv: s.naziv,
        kpd: s.kpd ?? null,
        jedinica: s.jedinica,
        kolicina: s.kolicina,
        cijena: centiUDecimal(s.cijena),
        popust: s.popust,
        vrstaIsporuke: s.vrstaIsporuke,
        stopa: s.kategorija.stopa,
        kategorija: s.kategorija.kod,
        iznos: centiUDecimal(s.iznos),
        izvornaStavkaId: s.izvornaStavkaId ?? null,
      })),
    });
    await tx.prodajniDokument.update({
      where: { id: r.id },
      data: {
        osnovica: centiUDecimal(izr.zbrojevi.osnovica),
        pdv: centiUDecimal(izr.zbrojevi.pdv),
        ukupno: centiUDecimal(izr.zbrojevi.ukupno),
        verzija: { increment: 1 },
      },
    });
  });
}
