import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { datumVrijemeCis } from "@/domain/fiskalizacija";
import { pozivNaBrojRacuna } from "@/domain/hub3";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala } from "@/domain/novac";
import { izracunaj, kategorijaPoKodu, type KodKategorije } from "@/domain/pdv";
import { provjeriUbl } from "@/lib/eracun/provjera";
import { posrednik, type StatusERacuna } from "@/lib/eracun/posrednik";
import { ublXml, type RacunUbl, type StrankaUbl } from "@/lib/eracun/ubl";
import { sFirmom } from "@/lib/firma-db";
import { GreskaKorisniku } from "@/lib/greske";
import { pdfDokumenta } from "@/lib/pdf-dokumenta";
import { podaciZaPdf } from "@/queries/prodaja-pdf";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

type Tx = Prisma.TransactionClient;

export const STATUSI_ERACUNA: Record<StatusERacuna, string> = {
  SALJE: "Šalje se",
  POSLAN: "Poslan",
  ISPORUCEN: "Isporučen",
  PRIHVACEN: "Prihvaćen",
  ODBIJEN: "Odbijen",
  GRESKA: "Greška",
};
const VRSTE = ["RACUN", "PREDUJAM", "ODOBRENJE", "STORNO"] as const;
/** eRačun se može ponovno poslati samo kad prethodni nije prošao */
const NEUSPJELI = ["ODBIJEN", "GRESKA"];

type Snimka = {
  firma?: {
    naziv: string;
    oib: string;
    adresa: string | null;
    postanskiBroj: string | null;
    mjesto: string | null;
    email: string | null;
    iban: string | null;
    uSustavuPdv?: boolean;
  };
  kupac?: {
    naziv: string;
    oib: string | null;
    pdvBroj: string | null;
    drzava?: string;
    adresa: string | null;
    postanskiBroj: string | null;
    mjesto: string | null;
    email?: string | null;
  } | null;
  napomene?: string[];
  racun?: { nacinPlacanja: string; operater: string };
};

/** Podaci izdanog dokumenta za UBL (iz snimke, kako je izdan). Greška korisniku ako dokument nije za eRačun. */
export async function podaciZaUbl(db: PrismaClient, firmaId: string, id: string, sPdf = true): Promise<RacunUbl> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Račun ne postoji.");
  const d = await db.prodajniDokument.findFirst({
    where: { id, firmaId },
    include: { stavke: { orderBy: { redoslijed: "asc" } }, firma: true, partner: { select: { drzava: true, email: true } } },
  });
  if (!d) throw new GreskaKorisniku("Račun ne postoji.");
  if (!(VRSTE as readonly string[]).includes(d.vrsta) || !d.broj || !d.izdano) throw new GreskaKorisniku("eRačun se šalje samo za izdani račun.");
  const s = (d.snimka as Snimka | null) ?? {};
  const f = s.firma ?? d.firma;
  const k = s.kupac;
  if (!k) throw new GreskaKorisniku("Račun nema kupca — eRačun nije moguć.");
  const korisnik = d.korisnikId ? await db.korisnik.findUnique({ where: { id: d.korisnikId }, select: { oib: true } }) : null;
  const izvor = d.izvorId ? await db.prodajniDokument.findFirst({ where: { id: d.izvorId, firmaId }, select: { broj: true, datum: true } }) : null;
  const dan = (x: Date) => x.toISOString().slice(0, 10);
  const c = (x: Prisma.Decimal) => centiIzDecimala(x.toFixed(2));
  const z = izracunaj(
    d.stavke.map((x) => ({
      kolicina: x.kolicina,
      cijena: c(x.cijena),
      popust: x.popust,
      kategorija: { kod: x.kategorija as KodKategorije, stopa: x.stopa },
      bezPopustaDokumenta: x.vrsta === "PREDUJAM",
    })),
    d.popust,
  );
  const stranka = (x: NonNullable<Snimka["kupac"]>, drzava: string): StrankaUbl => ({
    naziv: x.naziv,
    oib: x.oib,
    pdvBroj: x.pdvBroj,
    adresa: x.adresa,
    postanskiBroj: x.postanskiBroj,
    mjesto: x.mjesto,
    drzava,
    email: x.email ?? null,
  });
  let pdf: RacunUbl["pdf"] = null;
  if (sPdf) {
    const p = await podaciZaPdf(sFirmom(db, firmaId), firmaId, id);
    if (p) pdf = { naziv: p.datoteka, base64: (await pdfDokumenta(p.podaci)).toString("base64") };
  }
  return {
    vrsta: d.vrsta as RacunUbl["vrsta"],
    broj: d.broj,
    datum: dan(d.datum),
    vrijeme: datumVrijemeCis(d.izdano).slice(11),
    dospijece: d.dospijece ? dan(d.dospijece) : null,
    prodavatelj: {
      naziv: f.naziv,
      oib: f.oib,
      pdvBroj: null,
      adresa: f.adresa,
      postanskiBroj: f.postanskiBroj,
      mjesto: f.mjesto,
      drzava: "HR",
      email: f.email,
      uSustavuPdv: s.firma?.uSustavuPdv ?? d.firma.uSustavuPdv,
      iban: f.iban?.replace(/\s+/g, "") ?? null,
    },
    operater: { ime: s.racun?.operater ?? d.korisnik, oib: d.oibOperatera ?? korisnik?.oib ?? f.oib },
    kupac: stranka(k, k.drzava ?? d.partner?.drzava ?? "HR"),
    izvorni: izvor?.broj ? { broj: izvor.broj, datum: dan(izvor.datum) } : null,
    nacinPlacanja: s.racun?.nacinPlacanja ?? d.nacinPlacanja,
    pozivNaBroj: d.redni && d.godina ? `HR00 ${pozivNaBrojRacuna(d.redni, d.godina)}` : null,
    napomene: [...(s.napomene ?? []), ...(d.napomena ? [d.napomena] : [])],
    stavke: d.stavke.map((x, i) => {
      const kat = kategorijaPoKodu(x.kategorija as KodKategorije, x.stopa);
      return {
        naziv: x.naziv,
        opis: x.opis,
        kpd: x.kpd,
        jedinica: x.jedinica,
        kolicina: x.kolicina,
        cijena: c(x.cijena),
        iznos: z.stavke[i]!.iznos,
        ublKod: kat.ublKod,
        stopa: x.stopa,
      };
    }),
    poKategoriji: z.poKategoriji.map((g) => {
      const kat = kategorijaPoKodu(g.kod, g.stopa);
      return {
        ublKod: kat.ublKod,
        stopa: g.stopa,
        osnovica: g.osnovica,
        pdv: g.pdv,
        vatex: kat.oslobodjenje?.vatex ?? null,
        tekst: kat.oslobodjenje?.tekst ?? null,
      };
    }),
    osnovica: z.osnovica,
    pdv: z.pdv,
    ukupno: z.ukupno,
    pdf,
  };
}

/** UBL XML izdanog računa (preuzimanje) i popis grešaka provjere. */
export async function ublRacuna(db: PrismaClient, firmaId: string, id: string): Promise<{ xml: string; greske: string[]; broj: string }> {
  const r = await podaciZaUbl(db, firmaId, id);
  const xml = ublXml(r);
  return { xml, greske: provjeriUbl(xml), broj: r.broj };
}

/**
 * Slanje eRačuna preko posrednika: provjera UBL-a, provjera kupca u AMS-u, slanje, zapis.
 * Mrežni pozivi su izvan transakcije; zapis i dnevnik u jednoj.
 */
export async function posaljiERacun(db: PrismaClient, akter: Akter, id: string, sada = new Date()): Promise<{ status: StatusERacuna }> {
  const f = akter.firmaId;
  const izvor = await db.prodajniDokument.findFirst({ where: { id, firmaId: f }, select: { snimka: true } });
  // uvezeni račun izdan je (i poslan) u starom programu: ponovno slanje bi ga dupliciralo kupcu i Poreznoj
  if (jeUvezen(izvor?.snimka)) throw new GreskaKorisniku("Račun je uvezen iz starog programa — eRačun je poslan iz njega i ne šalje se ponovno.");
  const r = await podaciZaUbl(db, f, id);
  if (r.kupac.drzava !== "HR" || !r.kupac.oib) throw new GreskaKorisniku("eRačun se šalje hrvatskom kupcu s OIB-om; stranom kupcu pošaljite PDF.");
  const xml = ublXml(r);
  const greske = provjeriUbl(xml);
  if (greske.length) throw new GreskaKorisniku(`eRačun nije ispravan: ${greske.slice(0, 5).join("; ")}`);

  const p = posrednik();
  const dok = await db.prodajniDokument.findFirstOrThrow({ where: { id, firmaId: f }, select: { partnerId: true } });
  const ams = await p.provjeriPrimatelja(r.kupac.oib);
  if (dok.partnerId)
    await db.partner.updateMany({
      where: { id: dok.partnerId, firmaId: f },
      data: { eRacunAktivan: ams.aktivan, eRacunAdresa: ams.adresa, eRacunProvjereno: sada },
    });
  if (!ams.aktivan) throw new GreskaKorisniku("Kupac nije u adresaru eRačuna (AMS) — pošaljite mu račun e-poštom (PDF).");

  // zauzimanje prije slanja: dvije kartice / dvostruki klik ne šalju isti eRačun dvaput
  const ime = (await db.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
  const zapis = await db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `eracun:${id}`);
    const zadnji = await tx.eRacun.findFirst({ where: { firmaId: f, dokumentId: id }, orderBy: { poslano: "desc" } });
    const zaglavljen = zadnji?.status === "SALJE" && zadnji.poslano.getTime() < sada.getTime() - 10 * 60_000;
    if (zadnji && !NEUSPJELI.includes(zadnji.status) && !zaglavljen)
      throw new GreskaKorisniku(zadnji.status === "SALJE" ? "eRačun se upravo šalje." : "eRačun je već poslan.");
    return tx.eRacun.create({
      data: { firmaId: f, dokumentId: id, status: "SALJE", posrednik: p.naziv, xml, korisnikId: akter.korisnikId, korisnik: ime, poslano: sada },
      select: { id: true },
    });
  });

  let status: StatusERacuna = "POSLAN";
  let posrednikId: string | null = null;
  let poruka: string | null = null;
  try {
    posrednikId = (await p.posalji(xml, { posiljatelj: r.prodavatelj.oib!, primatelj: r.kupac.oib, broj: r.broj })).id;
  } catch (e) {
    status = "GRESKA";
    poruka = e instanceof Error ? e.message.slice(0, 500) : "Slanje nije uspjelo.";
  }
  await db.$transaction(async (tx) => {
    await tx.eRacun.update({ where: { id: zapis.id }, data: { status, posrednikId, poruka } });
    // uplate upisane prije slanja također idu u eIzvještavanje
    if (status === "POSLAN") {
      const uplate = await tx.uplata.findMany({ where: { firmaId: f, dokumentId: id, ponistena: false } });
      for (const u of uplate) await zabiljeziNaplatu(tx, f, id, u);
    }
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "eracun.posalji",
      entitet: "ProdajniDokument",
      entitetId: id,
      opis: `eRačun ${r.broj} → ${r.kupac.naziv} (${p.naziv}): ${STATUSI_ERACUNA[status]}${poruka ? ` — ${poruka}` : ""}`,
    });
  });
  if (status === "GRESKA") throw new GreskaKorisniku(`Slanje eRačuna nije uspjelo: ${poruka}`);
  return { status };
}

/** Status zadnjeg poslanog eRačuna od posrednika. */
export async function osvjeziStatusERacuna(db: PrismaClient, akter: Akter, id: string, sada = new Date()): Promise<StatusERacuna> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Račun ne postoji.");
  const e = await db.eRacun.findFirst({ where: { firmaId: akter.firmaId, dokumentId: id }, orderBy: { poslano: "desc" } });
  if (!e?.posrednikId) throw new GreskaKorisniku("eRačun nije poslan.");
  const s = await posrednik().status(e.posrednikId);
  if (s.status !== e.status) {
    await db.$transaction(async (tx) => {
      await tx.eRacun.update({ where: { id: e.id }, data: { status: s.status, poruka: s.poruka, provjereno: sada } });
      await zapisiDnevnik(tx, {
        firmaId: akter.firmaId,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "eracun.status",
        entitet: "ProdajniDokument",
        entitetId: id,
        opis: `eRačun: ${STATUSI_ERACUNA[e.status as StatusERacuna]} → ${STATUSI_ERACUNA[s.status]}${s.poruka ? ` (${s.poruka})` : ""}`,
      });
    });
  } else await db.eRacun.update({ where: { id: e.id }, data: { provjereno: sada } });
  return s.status;
}

/** Je li za dokument poslan eRačun (koji nije odbijen) — tada se naplata prijavljuje (eIzvještavanje). */
async function imaERacun(tx: Tx, firmaId: string, dokumentId: string) {
  const e = await tx.eRacun.findFirst({ where: { firmaId, dokumentId }, orderBy: { poslano: "desc" }, select: { status: true } });
  return !!e && !NEUSPJELI.includes(e.status) && e.status !== "SALJE";
}

/** Uplata na eRačun → izvještaj o naplati (čeka slanje). Zove se u transakciji upisa uplate. */
export async function zabiljeziNaplatu(tx: Tx, firmaId: string, dokumentId: string, u: { id: string; iznos: Prisma.Decimal; datum: Date }) {
  if (!(await imaERacun(tx, firmaId, dokumentId))) return;
  await tx.eIzvjestaj.upsert({
    where: { firmaId_uplataId: { firmaId, uplataId: u.id } },
    create: { firmaId, dokumentId, vrsta: "NAPLATA", iznos: u.iznos, datum: u.datum, uplataId: u.id },
    update: {},
  });
}

/** Poništena uplata: neposlani izvještaj se briše, već poslani se ispravlja izvještajem s minusom. */
export async function ponistiNaplatu(tx: Tx, firmaId: string, u: { id: string; dokumentId: string; iznos: Prisma.Decimal; datum: Date }) {
  const iz = await tx.eIzvjestaj.findUnique({ where: { firmaId_uplataId: { firmaId, uplataId: u.id } } });
  if (!iz) return;
  // neposlan (čeka ili greška) se briše; poslan ili u slanju ispravlja se izvještajem s minusom
  if (iz.status === "CEKA" || iz.status === "GRESKA") await tx.eIzvjestaj.delete({ where: { id: iz.id } });
  else
    await tx.eIzvjestaj.create({
      data: { firmaId, dokumentId: u.dokumentId, vrsta: "NAPLATA", iznos: u.iznos.negated(), datum: u.datum, razlog: "Ispravak: poništena uplata" },
    });
}

/** Slanje izvještaja koji čekaju (jedna firma ili sve). Greška ostaje zapisana; pokušava se ponovno. */
export async function posaljiIzvjestaje(db: PrismaClient, firmaId: string | null, sada = new Date()): Promise<{ poslano: number; greske: number }> {
  const cekaju = await db.eIzvjestaj.findMany({
    where: {
      ...(firmaId ? { firmaId } : {}),
      OR: [{ status: { in: ["CEKA", "GRESKA"] } }, { status: "SALJE", poslano: { lt: new Date(sada.getTime() - 10 * 60_000) } }],
    },
    include: { dokument: { select: { broj: true } }, firma: { select: { oib: true } } },
    orderBy: { stvoreno: "asc" },
    take: 200,
  });
  let poslano = 0;
  let greske = 0;
  for (const i of cekaju) {
    // zauzimanje: pozadinski posao i gumb ne šalju isti izvještaj dvaput
    const z = await db.eIzvjestaj.updateMany({
      where: { id: i.id, status: i.status, poslano: i.poslano },
      data: { status: "SALJE", poslano: sada },
    });
    if (z.count === 0) continue;
    try {
      const r = await posrednik().izvijesti({
        vrsta: i.vrsta as "NAPLATA" | "ODBIJANJE",
        broj: i.dokument.broj ?? "",
        oibIzdavatelja: i.firma.oib,
        iznos: i.iznos.toFixed(2),
        datum: i.datum.toISOString().slice(0, 10),
        razlog: i.razlog,
      });
      await db.eIzvjestaj.update({ where: { id: i.id }, data: { status: "POSLAN", posrednikId: r.id, poruka: null, poslano: sada } });
      poslano++;
    } catch (e) {
      await db.eIzvjestaj.update({
        where: { id: i.id },
        data: { status: "GRESKA", poruka: e instanceof Error ? e.message.slice(0, 500) : "Greška" },
      });
      greske++;
    }
  }
  return { poslano, greske };
}

/** Račun uvezen iz starog programa (snimka nosi oznaku uvoza). */
export function jeUvezen(snimka: unknown): boolean {
  return !!snimka && typeof snimka === "object" && "uvoz" in snimka;
}
