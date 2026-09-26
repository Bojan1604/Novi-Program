import { randomUUID } from "node:crypto";
import type { Firma, PrismaClient } from "@/generated/prisma/client";
import { centiIzDecimala } from "@/domain/novac";
import { datumVrijemeCis, iznosCis, sljedeciPokusaj, trebaFiskalizaciju, ulazZki, type NacinFiskalizacije } from "@/domain/fiskalizacija";
import type { ZbrojKategorije } from "@/domain/pdv";
import { demoCertifikat, ucitajP12, type Certifikat } from "@/lib/fiskalizacija/certifikat";
import { ADRESE_CIS, izracunajZki, posaljiCis, potpisi, racunZahtjev } from "@/lib/fiskalizacija/cis";
import { GreskaKorisniku } from "@/lib/greske";
import { desifriraj } from "@/lib/tajne";
import type { Tx } from "./prodaja";

/** Certifikat za potpis: demo način koristi samopotpisani, test i produkcija FINA certifikat firme. */
export function certifikatFirme(f: Pick<Firma, "fiskalNacin" | "fiskalCertifikat" | "fiskalLozinka">): Certifikat {
  if (f.fiskalNacin === "DEMO") return demoCertifikat();
  if (!f.fiskalCertifikat) throw new GreskaKorisniku("Za fiskalizaciju učitajte certifikat u Postavkama (ili uključite demo način).");
  const p12 = desifriraj(f.fiskalCertifikat);
  const lozinka = desifriraj(f.fiskalLozinka);
  if (!p12 || lozinka === null)
    throw new GreskaKorisniku("Spremljeni certifikat ne može se pročitati (promijenjen TAJNI_KLJUC?) — učitajte ga ponovno u Postavkama.");
  return ucitajP12(Buffer.from(p12, "base64"), lozinka);
}

/**
 * Pri izdavanju računa (u istoj transakciji): odluka treba li fiskalizacija i ZKI.
 * Slanje CIS-u ide nakon transakcije (`fiskaliziraj`) — račun je izdan i kad CIS ne odgovara (naknadna dostava).
 */
export async function pripremiFiskalizaciju(
  tx: Tx,
  p: { firma: Firma; korisnikId: string; vrsta: string; nacinPlacanja: string; kupacImaOib: boolean; redni: number; ukupno: number; vrijeme: Date },
) {
  const nacin = p.firma.fiskalNacin as NacinFiskalizacije;
  if (nacin === "ISKLJUCENA" || !trebaFiskalizaciju(p)) return { fiskalStatus: "NIJE_POTREBNO", fiskalNacin: nacin };
  const cert = certifikatFirme(p.firma);
  const oibOperatera = (await tx.korisnik.findUnique({ where: { id: p.korisnikId }, select: { oib: true } }))?.oib ?? p.firma.oib;
  const zki = izracunajZki(
    ulazZki({
      oib: p.firma.oib,
      vrijeme: p.vrijeme,
      redni: p.redni,
      prostor: p.firma.oznakaProstora,
      uredaj: p.firma.oznakaUredaja,
      ukupno: p.ukupno,
    }),
    cert.kljucPem,
  );
  // prvi pokušaj šalje izdavanje odmah; pozadinski posao tek nakon minute
  return { fiskalStatus: "CEKA", fiskalNacin: nacin, zki, oibOperatera, fiskalSljedeci: new Date(p.vrijeme.getTime() + 60_000) };
}

type SnimkaRacuna = { racun?: { oznakaProstora: string; oznakaUredaja: string; nacinPlacanja: string; poKategoriji?: ZbrojKategorije[] } };

/**
 * Slanje računa CIS-u (demo: izmišljeni JIR bez slanja). Uspjeh → JIR; greška → sljedeći pokušaj (naknadna dostava).
 * Nikad ne baca iznimku: račun je već izdan, greška se pamti na računu.
 */
export async function fiskaliziraj(
  db: PrismaClient,
  firmaId: string,
  id: string,
  sada = new Date(),
  /** false = samo ako je došlo vrijeme sljedećeg pokušaja (pozadinski posao) */
  odmah = true,
): Promise<{ jir: string } | { greska: string }> {
  // zauzimanje: dok jedan proces šalje (najviše 30 s), drugi ne šalje isti račun
  const zauzeto = await db.prodajniDokument.updateMany({
    where: {
      id,
      firmaId,
      fiskalStatus: "CEKA",
      OR: [{ fiskalSaljeDo: null }, { fiskalSaljeDo: { lt: sada } }],
      ...(odmah ? {} : { fiskalSljedeci: { lte: sada } }),
    },
    data: { fiskalSaljeDo: new Date(sada.getTime() + 30_000) },
  });
  if (zauzeto.count === 0) return { greska: "Račun ne čeka fiskalizaciju ili se upravo šalje." };
  const d = await db.prodajniDokument.findFirst({ where: { id, firmaId }, include: { firma: true } });
  if (!d || d.fiskalStatus !== "CEKA" || !d.zki || !d.izdano || !d.redni) return { greska: "Račun ne čeka fiskalizaciju." };
  const f = d.firma;
  const naknadno = d.fiskalPokusaja > 0 || sada.getTime() - d.izdano.getTime() > 60_000;
  let ishod: { jir: string } | { greska: string };
  try {
    if (f.fiskalNacin === "DEMO") ishod = { jir: randomUUID() };
    else if (f.fiskalNacin === "TEST" || f.fiskalNacin === "PRODUKCIJA") {
      const s = ((d.snimka as SnimkaRacuna | null) ?? {}).racun;
      const predznak = d.vrsta === "STORNO" ? -1 : 1;
      const xml = racunZahtjev(
        {
          oib: f.oib,
          uSustavuPdv: f.uSustavuPdv,
          datumVrijeme: datumVrijemeCis(d.izdano),
          redni: d.redni,
          prostor: s?.oznakaProstora ?? f.oznakaProstora,
          uredaj: s?.oznakaUredaja ?? f.oznakaUredaja,
          pdv: (s?.poKategoriji ?? [])
            .filter((k) => k.kod === "HR")
            .map((k) => ({ stopa: (k.stopa / 100).toFixed(2), osnovica: iznosCis(predznak * k.osnovica), iznos: iznosCis(predznak * k.pdv) })),
          ukupno: iznosCis(centiIzDecimala(d.ukupno.toFixed(2))),
          nacinPlacanja: s?.nacinPlacanja ?? d.nacinPlacanja,
          oibOperatera: d.oibOperatera ?? f.oib,
          zki: d.zki,
          naknadnaDostava: naknadno,
        },
        randomUUID(),
        datumVrijemeCis(sada),
      );
      ishod = await posaljiCis(ADRESE_CIS[f.fiskalNacin], potpisi(xml, certifikatFirme(f)));
    } else ishod = { greska: "Fiskalizacija je isključena." };
  } catch (e) {
    ishod = { greska: e instanceof Error ? `Veza s CIS-om: ${e.message}` : "Veza s CIS-om nije uspjela." };
  }
  if ("jir" in ishod) {
    await db.prodajniDokument.updateMany({
      where: { id, firmaId, fiskalStatus: "CEKA" },
      data: {
        fiskalStatus: "FISKALIZIRAN",
        jir: ishod.jir,
        fiskalGreska: null,
        fiskalSljedeci: null,
        fiskalSaljeDo: null,
        fiskalPokusaja: { increment: 1 },
      },
    });
  } else {
    await db.prodajniDokument.updateMany({
      where: { id, firmaId, fiskalStatus: "CEKA" },
      data: {
        fiskalGreska: ishod.greska.slice(0, 500),
        fiskalSljedeci: sljedeciPokusaj(d.fiskalPokusaja, sada),
        fiskalSaljeDo: null,
        fiskalPokusaja: { increment: 1 },
      },
    });
  }
  return ishod;
}

/** Naknadna dostava: svi računi kojima je došlo vrijeme sljedećeg pokušaja (sve firme; poziva ga poslužitelj svake minute). */
export async function dostaviNaknadno(db: PrismaClient, sada = new Date(), najvise = 50): Promise<number> {
  const cekaju = await db.prodajniDokument.findMany({
    where: { fiskalStatus: "CEKA", fiskalSljedeci: { lte: sada } },
    orderBy: { fiskalSljedeci: "asc" },
    take: najvise,
    select: { id: true, firmaId: true },
  });
  for (const r of cekaju) await fiskaliziraj(db, r.firmaId, r.id, sada, false);
  return cekaju.length;
}
