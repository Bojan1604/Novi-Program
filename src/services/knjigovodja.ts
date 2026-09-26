import { strToU8, zipSync, type Zippable } from "fflate";
import type { PrismaClient } from "@/generated/prisma/client";
import { procitajPrimatelje } from "@/domain/eposta";
import { jeMjesec, sljedeciMjesec, type Mjesec } from "@/domain/najam";
import { centiIzDecimala } from "@/domain/novac";
import { imaPosebno } from "@/domain/prava";
import { VRSTE_PRODAJE, type VrstaProdaje } from "@/domain/prodaja";
import { sFirmom } from "@/lib/firma-db";
import { GreskaKorisniku } from "@/lib/greske";
import type { StupacIzvoza } from "@/lib/izvoz/stupci";
import { uCsv } from "@/lib/izvoz/csv";
import { pdfDokumenta } from "@/lib/pdf-dokumenta";
import { podaciZaPdf } from "@/queries/prodaja-pdf";
import { zapisiDnevnik } from "./dnevnik";
import { ublRacuna } from "./eracun";
import { prijevozPoste } from "./eposta";
import type { Akter } from "./korisnici";
import { pregledTroskova, type RedakTroska } from "./troskovi";

const d = (m: Mjesec) => new Date(`${m}-01T00:00:00Z`);
const dan = (x: Date) => x.toISOString().slice(0, 10);
const c = (x: { toFixed(n: number): string }) => centiIzDecimala(x.toFixed(2));
const siguranNaziv = (t: string) =>
  t
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

/** Izlazni i ulazni računi mjeseca te zadnja predaja knjigovođi. */
export async function popisZaKnjigovodju(db: PrismaClient, firmaId: string, mjesec: Mjesec) {
  if (!jeMjesec(mjesec)) throw new GreskaKorisniku("Mjesec nije ispravan.");
  const raspon = { gte: d(mjesec), lt: d(sljedeciMjesec(mjesec)) };
  const [izlazni, ulazni, predaje] = await Promise.all([
    db.prodajniDokument.findMany({
      where: { firmaId, vrsta: { in: ["RACUN", "PREDUJAM", "ODOBRENJE", "STORNO"] }, status: { not: "NACRT" }, datum: raspon },
      orderBy: [{ godina: "asc" }, { redni: "asc" }],
      select: {
        id: true,
        vrsta: true,
        status: true,
        broj: true,
        datum: true,
        osnovica: true,
        pdv: true,
        ukupno: true,
        izdano: true,
        partner: { select: { naziv: true, oib: true } },
      },
    }),
    db.ulazniRacun.findMany({
      // URA: samo knjiženi računi (odbijeni i stornirani eRačuni/računi ne ulaze u knjigu)
      where: { firmaId, datum: raspon, status: { in: ["EVIDENTIRAN", "PRIHVACEN"] } },
      orderBy: [{ redni: "asc" }],
      select: {
        id: true,
        interni: true,
        broj: true,
        datum: true,
        status: true,
        osnovica: true,
        pdv: true,
        ukupno: true,
        placeno: true,
        xml: true,
        dobavljacTekst: true,
        dobavljacOib: true,
        stvoreno: true,
        dobavljac: { select: { naziv: true, oib: true } },
      },
    }),
    db.predajaKnjigovodji.findMany({ where: { firmaId, mjesec: d(mjesec) }, orderBy: { vrijeme: "desc" }, take: 10 }),
  ]);
  const zadnja = predaje[0]?.vrijeme ?? null;
  return {
    izlazni: izlazni.map((x) => ({ ...x, novo: !zadnja || (x.izdano ?? x.datum) > zadnja })),
    ulazni: ulazni.map((x) => ({ ...x, novo: !zadnja || x.stvoreno > zadnja })),
    predaje,
  };
}

type Izlazni = Awaited<ReturnType<typeof popisZaKnjigovodju>>["izlazni"][number];
type Ulazni = Awaited<ReturnType<typeof popisZaKnjigovodju>>["ulazni"][number];

const IRA: StupacIzvoza<Izlazni>[] = [
  { naslov: "Broj", vrijednost: (x) => x.broj },
  { naslov: "Vrsta", vrijednost: (x) => VRSTE_PRODAJE[x.vrsta as VrstaProdaje]?.naziv ?? x.vrsta },
  { naslov: "Datum", vrsta: "datum", vrijednost: (x) => dan(x.datum) },
  { naslov: "Kupac", vrijednost: (x) => x.partner?.naziv ?? "" },
  { naslov: "OIB", vrijednost: (x) => x.partner?.oib ?? "" },
  { naslov: "Osnovica", vrsta: "iznos", vrijednost: (x) => c(x.osnovica) },
  { naslov: "PDV", vrsta: "iznos", vrijednost: (x) => c(x.pdv) },
  { naslov: "Ukupno", vrsta: "iznos", vrijednost: (x) => c(x.ukupno) },
  { naslov: "Status", vrijednost: (x) => (x.status === "STORNIRAN" ? "storniran" : "") },
];
const URA: StupacIzvoza<Ulazni>[] = [
  { naslov: "URA", vrijednost: (x) => x.interni },
  { naslov: "Broj dobavljača", vrijednost: (x) => x.broj },
  { naslov: "Datum", vrsta: "datum", vrijednost: (x) => dan(x.datum) },
  { naslov: "Dobavljač", vrijednost: (x) => x.dobavljac?.naziv ?? x.dobavljacTekst ?? "" },
  { naslov: "OIB", vrijednost: (x) => x.dobavljac?.oib ?? x.dobavljacOib ?? "" },
  { naslov: "Osnovica", vrsta: "iznos", vrijednost: (x) => c(x.osnovica) },
  { naslov: "PDV", vrsta: "iznos", vrijednost: (x) => c(x.pdv) },
  { naslov: "Ukupno", vrsta: "iznos", vrijednost: (x) => c(x.ukupno) },
  { naslov: "Plaćeno", vrsta: "iznos", vrijednost: (x) => c(x.placeno) },
  { naslov: "Status", vrijednost: (x) => x.status.toLowerCase() },
];
const TROSKOVI: StupacIzvoza<RedakTroska>[] = [
  { naslov: "Datum", vrsta: "datum", vrijednost: (x) => x.datum },
  { naslov: "Kategorija", vrijednost: (x) => x.kategorija },
  { naslov: "Opis", vrijednost: (x) => x.opis },
  { naslov: "Iznos", vrsta: "iznos", vrijednost: (x) => x.iznos },
  { naslov: "Plaćeno", vrijednost: (x) => (x.placeno ? "da" : "ne") },
];

/**
 * ZIP za knjigovođu: izlazni računi (PDF + UBL XML), ulazni (XML eRačuna + prilozi), troškovi s prilozima i knjige (CSV).
 * Bez prava nabavnih cijena u ZIP-u nema troška robe ni primki (ni nabavnih vrijednosti).
 */
/** Isti naziv u ZIP-u (dva priloga „racun.pdf“) ne smije prepisati prethodni: dodaje se „ (2)“. */
function jedinstveno(datoteke: Record<string, unknown>, put: string): string {
  if (!(put in datoteke)) return put;
  const t = put.lastIndexOf(".");
  const [ime, nastavak] = t > put.lastIndexOf("/") ? [put.slice(0, t), put.slice(t)] : [put, ""];
  for (let i = 2; ; i++) if (!(`${ime} (${i})${nastavak}` in datoteke)) return `${ime} (${i})${nastavak}`;
}

export async function zipZaKnjigovodju(
  db: PrismaClient,
  akter: Akter,
  mjesec: Mjesec,
): Promise<{ zip: Uint8Array; naziv: string; izlaznih: number; ulaznih: number }> {
  const f = akter.firmaId;
  const p = await popisZaKnjigovodju(db, f, mjesec);
  const vidiNabavu = imaPosebno(akter.prava, "costs");
  const datoteke: Zippable = {};
  for (const x of p.izlazni) {
    const pdf = await podaciZaPdf(sFirmom(db, f), f, x.id);
    const ime = siguranNaziv(x.broj ?? x.id).replace(/\//g, "-");
    if (pdf) datoteke[`izlazni/${ime}.pdf`] = new Uint8Array(await pdfDokumenta(pdf.podaci));
    try {
      datoteke[`izlazni/${ime}.xml`] = strToU8((await ublRacuna(db, f, x.id)).xml);
    } catch {
      // dokument bez kupca ili nepotpun za eRačun: samo PDF
    }
  }
  const prilozi = await db.prilog.findMany({
    where: { firmaId: f, entitet: "UlazniRacun", entitetId: { in: p.ulazni.map((x) => x.id) } },
    select: { entitetId: true, naziv: true, sadrzaj: true },
  });
  for (const x of p.ulazni) {
    const mapa = `ulazni/${siguranNaziv(`${x.interni} ${x.broj}`).replace(/\//g, "-")}`;
    if (x.xml) datoteke[`${mapa}/eRacun.xml`] = strToU8(x.xml);
    for (const pr of prilozi.filter((y) => y.entitetId === x.id))
      datoteke[jedinstveno(datoteke, `${mapa}/${siguranNaziv(pr.naziv)}`)] = new Uint8Array(pr.sadrzaj);
  }
  const od = `${mjesec}-01`;
  const doD = new Date(d(sljedeciMjesec(mjesec)).getTime() - 864e5).toISOString().slice(0, 10);
  const troskovi = (await pregledTroskova(db, f, akter.prava, od, doD)).filter(
    (t) => vidiNabavu || (t.izvor !== "NARUDZBENICA" && t.izvor !== "PRIMKA"),
  );
  const priloziTroskova = await db.prilog.findMany({
    where: {
      firmaId: f,
      entitet: "Trosak",
      entitetId: { in: troskovi.filter((t) => t.izvor === "RUCNI" || t.izvor === "PONAVLJAJUCI").map((t) => t.id) },
    },
    select: { entitetId: true, naziv: true, sadrzaj: true },
  });
  for (const pr of priloziTroskova)
    datoteke[jedinstveno(datoteke, `troskovi/${pr.entitetId.slice(0, 8)}-${siguranNaziv(pr.naziv)}`)] = new Uint8Array(pr.sadrzaj);
  datoteke["knjiga-IRA.csv"] = strToU8(uCsv(IRA, p.izlazni));
  datoteke["knjiga-URA.csv"] = strToU8(uCsv(URA, p.ulazni));
  datoteke["troskovi.csv"] = strToU8(uCsv(TROSKOVI, troskovi));
  const firma = await db.firma.findUniqueOrThrow({ where: { id: f }, select: { naziv: true } });
  return {
    zip: zipSync(datoteke, { level: 6 }),
    naziv: `${siguranNaziv(firma.naziv)}-${mjesec}.zip`,
    izlaznih: p.izlazni.length,
    ulaznih: p.ulazni.length,
  };
}

/** „Označi poslano“: zapis predaje (ZIP, e-pošta ili ručno) — sljedeći popis označava samo nove dokumente. */
export async function oznaciPredaju(db: PrismaClient, akter: Akter, mjesec: Mjesec, nacin: "ZIP" | "EPOSTA" | "RUCNO", prima: string | null = null) {
  if (!jeMjesec(mjesec)) throw new GreskaKorisniku("Mjesec nije ispravan.");
  const p = await popisZaKnjigovodju(db, akter.firmaId, mjesec);
  const ime = (await db.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
  await db.$transaction(async (tx) => {
    await tx.predajaKnjigovodji.create({
      data: {
        firmaId: akter.firmaId,
        mjesec: d(mjesec),
        nacin,
        prima,
        izlaznih: p.izlazni.length,
        ulaznih: p.ulazni.length,
        korisnikId: akter.korisnikId,
        korisnik: ime,
      },
    });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "knjigovodja.predaja",
      entitet: "Firma",
      entitetId: akter.firmaId,
      opis: `Knjigovođi predano za ${mjesec.slice(5)}/${mjesec.slice(0, 4)} (${nacin === "EPOSTA" ? `e-poštom na ${prima}` : nacin === "ZIP" ? "ZIP" : "označeno ručno"}): ${p.izlazni.length} izlaznih, ${p.ulazni.length} ulaznih`,
    });
  });
}

/** Slanje ZIP-a knjigovođi e-poštom (SMTP firme) i zapis predaje. Adresa se pamti u postavkama firme. */
export async function posaljiKnjigovodji(db: PrismaClient, akter: Akter, mjesec: Mjesec, prima: string): Promise<void> {
  const adrese = procitajPrimatelje(prima);
  if (!adrese.ok) throw new GreskaKorisniku(adrese.greska);
  const firma = await db.firma.findUniqueOrThrow({ where: { id: akter.firmaId } });
  const prijevoz = prijevozPoste(firma);
  if (!prijevoz) throw new GreskaKorisniku("Za slanje e-poštom upišite SMTP u Postavkama (ili preuzmite ZIP i pošaljite ga sami).");
  const z = await zipZaKnjigovodju(db, akter, mjesec);
  if (z.zip.length > 20 * 1024 * 1024) throw new GreskaKorisniku("ZIP je veći od 20 MB — preuzmite ga i pošaljite drugim putem.");
  await prijevoz.sendMail({
    from: firma.epostaPosiljatelj ? { name: firma.naziv, address: firma.epostaPosiljatelj } : (firma.smtpKorisnik ?? undefined),
    to: adrese.vrijednost,
    subject: `${firma.naziv} — dokumenti za ${mjesec.slice(5)}/${mjesec.slice(0, 4)}`,
    text: `Poštovani,\n\nu privitku su izlazni (${z.izlaznih}) i ulazni (${z.ulaznih}) računi, troškovi i knjige za ${mjesec.slice(5)}/${mjesec.slice(0, 4)}.\n\nLijep pozdrav,\n${firma.naziv}`,
    attachments: [{ filename: z.naziv, content: Buffer.from(z.zip), contentType: "application/zip" }],
  });
  if ((firma.epostaKnjigovodje ?? "") !== prima.trim())
    await db.$transaction(async (tx) => {
      await tx.firma.update({ where: { id: akter.firmaId }, data: { epostaKnjigovodje: prima.trim() } });
      await zapisiDnevnik(tx, {
        firmaId: akter.firmaId,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "knjigovodja.predaja",
        entitet: "Firma",
        entitetId: akter.firmaId,
        opis: "Promijenjena e-pošta knjigovođe",
        staro: { epostaKnjigovodje: firma.epostaKnjigovodje },
        novo: { epostaKnjigovodje: prima.trim() },
      });
    });
  await oznaciPredaju(db, akter, mjesec, "EPOSTA", prima.trim());
}
