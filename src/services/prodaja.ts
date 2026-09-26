import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { danas, datum as uDatum, dodajDane, jeDatum, usporedi } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import { pdvStatus, type PdvStatus } from "@/domain/partner";
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
import { sljedeciBroj, sljedeciBrojSDatumom } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { promijeniStanje } from "./uredaji";

type Tx = Prisma.TransactionClient;

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
export async function spremiNacrt(db: PrismaClient, akter: Akter, id: string | null, ulaz: UlazDokumenta): Promise<{ id: string; verzija: number }> {
  if (!jeVrstaProdaje(ulaz.vrsta)) throw new GreskaKorisniku("Nepoznata vrsta dokumenta.");
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

  return db.$transaction(async (tx) => {
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
        const izvorne = new Set(
          (await tx.stavkaProdajnogDokumenta.findMany({ where: { firmaId: f, dokumentId: dok.izvorId ?? undefined }, select: { id: true } })).map(
            (x) => x.id,
          ),
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
    if (ulaz.poslovnicaId && !(await tx.poslovnica.count({ where: { id: ulaz.poslovnicaId, firmaId: f, partnerId: ulaz.partnerId ?? undefined } })))
      throw new GreskaKorisniku("Poslovnica ne pripada kupcu.");
    await provjeriReference(tx, f, ulaz.stavke);

    const firma = await postavkeFirme(tx, f);
    const r = izracunajDokument(ulaz.stavke, {
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
        izvornaStavkaId: s.izvornaStavkaId ?? null,
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

/** Napomene o PDV-u za spremljene stavke (iz kategorija). */
async function napomeneDokumenta(tx: Tx, firmaId: string, dokumentId: string, partner: Parameters<typeof statusKupca>[0], popust: number) {
  const firma = await postavkeFirme(tx, firmaId);
  const stavke = await tx.stavkaProdajnogDokumenta.findMany({ where: { firmaId, dokumentId }, orderBy: { redoslijed: "asc" } });
  return izracunajDokument(stavke.map(uUlaznu), {
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

export const NACINI_PLACANJA: Record<string, string> = { T: "Transakcijski račun", G: "Gotovina", K: "Kartica", O: "Ostalo" };

/**
 * Izdavanje računa: broj redni/prostor/uređaj (bez rupa, datumi po pravilima), KPD na svakoj stavci,
 * uređaji istog modela spojeni u jednu stavku, prodani uređaji prelaze u „Prodan“ kroz jedino pravilo prijelaza,
 * snimka postavki firme — kasnija promjena postavki ne mijenja izdani račun.
 */
export async function izdajRacun(db: PrismaClient, akter: Akter, id: string, sada = new Date()): Promise<{ broj: string }> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Račun ne postoji.");
  return db.$transaction(
    async (tx) => {
      const f = akter.firmaId;
      await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${id}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
      const dok = await tx.prodajniDokument.findFirst({
        where: { id, firmaId: f },
        include: {
          partner: { select: { drzava: true, pdvBroj: true, pdvStatus: true, aktivan: true } },
          stavke: { orderBy: { redoslijed: "asc" }, include: { uredaj: { select: { serijski: true } } } },
        },
      });
      if (!dok) throw new GreskaKorisniku("Račun ne postoji.");
      if (dok.vrsta !== "RACUN" && dok.vrsta !== "ODOBRENJE") throw new GreskaKorisniku("Ovo nije račun.");
      if (dok.status !== "NACRT") throw new GreskaKorisniku("Račun je već izdan.");
      if (dok.stavke.length === 0) throw new GreskaKorisniku("Dodajte barem jednu stavku.");
      const jeOdobrenje = dok.vrsta === "ODOBRENJE";
      const prodaniUredaji = jeOdobrenje ? [] : dok.stavke.filter((s) => s.uredajId && s.namjena === "PRODAJA").map((s) => s.uredajId!);
      const vraceniUredaji = jeOdobrenje ? dok.stavke.filter((s) => s.uredajId && s.namjena === "PRODAJA").map((s) => s.uredajId!) : [];
      if (prodaniUredaji.length && !dok.partnerId) throw new GreskaKorisniku("Za prodaju uređaja odaberite kupca.");

      const firma = await postavkeFirme(tx, f);
      const r = izracunajDokument(
        dok.stavke.map((s) => ({ ...uUlaznu(s), serijskiBroj: s.uredaj?.serijski ?? null })),
        { firmaUSustavuPdv: firma.uSustavuPdv, pdvPoNaplacenoj: firma.pdvPoNaplacenoj, statusKupca: statusKupca(dok.partner), popust: dok.popust },
      );
      const kpd = provjeriZaIzdavanje(r.grupirane);
      if (kpd) throw new GreskaKorisniku(kpd);
      if (jeOdobrenje) {
        // izvorni račun zaključan dok se izdaje odobrenje — dvije kartice ne mogu zajedno prijeći iznos računa
        if (!dok.izvorId) throw new GreskaKorisniku("Odobrenje nema izvorni račun.");
        await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${dok.izvorId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
        const izvor = await tx.prodajniDokument.findFirstOrThrow({
          where: { id: dok.izvorId, firmaId: f },
          include: { stavke: { select: { id: true, naziv: true, kolicina: true, iznos: true } } },
        });
        if (izvor.status !== "IZDAN") throw new GreskaKorisniku("Izvorni račun je storniran — odobrenje nije moguće.");
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
      await tx.prodajniDokument.update({
        where: { id },
        data: {
          status: "IZDAN",
          broj,
          godina: Number(datum.slice(0, 4)),
          redni,
          izdano: sada,
          snimka,
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
        opis: `Izdan${jeOdobrenje ? "o odobrenje" : " račun"} ${broj} (${(r.zbrojevi.ukupno / 100).toFixed(2)} €, uređaja: ${prodaniUredaji.length})`,
      });
      return { broj };
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
    const stavke: UlaznaStavka[] = r.stavke.flatMap((s) => {
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
    const izr = izracunajDokument(stavke, {
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
): Promise<{ id: string; broj: string }> {
  if (!jeUuid(racunId)) throw new GreskaKorisniku("Račun ne postoji.");
  if (!jeUuid(skladisteId)) throw new GreskaKorisniku("Odaberite skladište za vraćene uređaje.");
  return db.$transaction(
    async (tx) => {
      const f = akter.firmaId;
      await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${racunId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
      const r = await tx.prodajniDokument.findFirst({
        where: { id: racunId, firmaId: f },
        include: { stavke: { orderBy: { redoslijed: "asc" }, include: { uredaji: { select: { uredajId: true } } } } },
      });
      if (!r) throw new GreskaKorisniku("Račun ne postoji.");
      const brojOdobrenja = await tx.prodajniDokument.count({ where: { firmaId: f, izvorId: r.id, vrsta: "ODOBRENJE", status: "IZDAN" } });
      const g = provjeriStorno({ vrsta: r.vrsta, status: r.status, brojOdobrenja });
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
          snimka: { ...((r.snimka as object | null) ?? {}), stornoRacuna: r.broj },
          korisnikId: akter.korisnikId,
          korisnik: ime,
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
      return { id: storno.id, broj };
    },
    { timeout: 60_000 },
  );
}
