import "server-only";
import { jedan, vise, type ParametriUrl } from "@/domain/popis";
import { imaPosebno, type PotrebnoPravo } from "@/domain/prava";
import type { Kontekst } from "@/lib/akcija";
import { dnevnikZaIzvoz } from "@/queries/dnevnik";
import { popisClanova } from "@/queries/korisnici";
import { uvjetPartnera } from "@/queries/partneri";
import { uvjetPrimki } from "@/queries/primke";
import { centiIzDecimala } from "@/domain/novac";
import type { StupacIzvoza } from "./stupci";

export const NAJVISE_REDAKA = { csv: 100_000, xlsx: 100_000, pdf: 5_000 } as const;
export type Format = keyof typeof NAJVISE_REDAKA;

type Izvor<R> = {
  naslov: string;
  pravo: PotrebnoPravo;
  stupci: StupacIzvoza<R>[];
  /** isti filtri kao na ekranu (iz URL-a) */
  dohvati: (k: Kontekst, sp: ParametriUrl, najvise: number) => Promise<R[]>;
};

function izvor<R>(i: Izvor<R>): Izvor<unknown> {
  return i as unknown as Izvor<unknown>;
}

/** Svi popisi koji se mogu izvesti. Novi popis = novi unos ovdje. */
export const IZVORI: Record<string, Izvor<unknown>> = {
  dnevnik: izvor({
    naslov: "Dnevnik promjena",
    pravo: { posebno: "log" },
    stupci: [
      { naslov: "Vrijeme", vrsta: "vrijeme", vrijednost: (z) => z.vrijeme },
      { naslov: "Korisnik", vrijednost: (z) => z.korisnik, sirina: 14 },
      { naslov: "Opis", vrijednost: (z) => z.opis, sirina: 34 },
      { naslov: "Promjene", vrijednost: (z) => z.promjene.map((p) => `${p.polje}: ${p.staro ?? "—"} → ${p.novo ?? "—"}`).join("\n"), sirina: 40 },
    ],
    dohvati: (k, sp, najvise) =>
      dnevnikZaIzvoz(
        k.db,
        k.firmaId,
        {
          korisnikId: jedan(sp["korisnik"]),
          entitet: jedan(sp["entitet"]),
          entitetId: jedan(sp["id"]),
          od: jedan(sp["od"]),
          do: jedan(sp["do"]),
          trazi: jedan(sp["trazi"]),
        },
        imaPosebno(k.prava, "costs"),
        najvise,
      ),
  } satisfies Izvor<Awaited<ReturnType<typeof dnevnikZaIzvoz>>[number]>),

  partneri: izvor({
    naslov: "Partneri",
    pravo: { modul: "partneri", razina: "pregled" },
    stupci: [
      { naslov: "Naziv", vrijednost: (p) => p.naziv, sirina: 28 },
      { naslov: "OIB", vrijednost: (p) => p.oib, sirina: 12 },
      { naslov: "PDV broj", vrijednost: (p) => p.pdvBroj, sirina: 14 },
      { naslov: "Država", vrijednost: (p) => p.drzava, sirina: 6 },
      { naslov: "Adresa", vrijednost: (p) => p.adresa },
      { naslov: "Poštanski broj", vrijednost: (p) => p.postanskiBroj, sirina: 8 },
      { naslov: "Mjesto", vrijednost: (p) => p.mjesto, sirina: 14 },
      { naslov: "E-pošta", vrijednost: (p) => p.email },
      { naslov: "Telefon", vrijednost: (p) => p.telefon, sirina: 12 },
      { naslov: "Kupac", vrijednost: (p) => (p.kupac ? "da" : "ne"), sirina: 6 },
      { naslov: "Dobavljač", vrijednost: (p) => (p.dobavljac ? "da" : "ne"), sirina: 6 },
      { naslov: "eRačun", vrijednost: (p) => p.eRacunAdresa, sirina: 14 },
    ],
    dohvati: (k, sp, najvise) =>
      k.db.partner.findMany({
        where: uvjetPartnera(k.firmaId, {
          trazi: jedan(sp["trazi"]),
          vrsta: vise(sp["vrsta"]),
          aktivnost: vise(sp["aktivnost"]).length ? vise(sp["aktivnost"]) : ["aktivni"],
        }),
        orderBy: { naziv: "asc" },
        take: najvise,
      }),
  } satisfies Izvor<Awaited<ReturnType<Kontekst["db"]["partner"]["findMany"]>>[number]>),

  primke: izvor({
    naslov: "Primke",
    pravo: { modul: "uredaji", razina: "pregled" },
    stupci: [
      { naslov: "Broj", vrijednost: (p) => p.broj, sirina: 12 },
      { naslov: "Datum", vrsta: "datum", vrijednost: (p) => p.datum.toISOString().slice(0, 10) },
      { naslov: "Dobavljač", vrijednost: (p) => p.dobavljac?.naziv ?? "" },
      { naslov: "Dokument dobavljača", vrijednost: (p) => p.dokumentDobavljaca, sirina: 14 },
      { naslov: "Skladište", vrijednost: (p) => p.skladiste.naziv, sirina: 14 },
      { naslov: "Uređaja", vrsta: "broj", vrijednost: (p) => p.brojUredaja },
      {
        naslov: "Nabavna vrijednost",
        vrsta: "iznos",
        osjetljivo: true,
        vrijednost: (p) => (p.nabavnaVrijednost ? centiIzDecimala(p.nabavnaVrijednost.toString()) : null),
      },
      { naslov: "Status", vrijednost: (p) => p.status, sirina: 10 },
    ],
    dohvati: (k, sp, najvise) =>
      k.db.primka.findMany({
        where: uvjetPrimki(k.firmaId, { trazi: jedan(sp["trazi"]), status: vise(sp["status"]) }),
        orderBy: [{ datum: "desc" }, { redni: "desc" }],
        take: najvise,
        include: { dobavljac: { select: { naziv: true } }, skladiste: { select: { naziv: true } } },
      }),
  } satisfies Izvor<{
    broj: string;
    datum: Date;
    dobavljac: { naziv: string } | null;
    dokumentDobavljaca: string | null;
    skladiste: { naziv: string };
    brojUredaja: number;
    nabavnaVrijednost: { toString(): string } | null;
    status: string;
  }>),

  korisnici: izvor({
    naslov: "Korisnici",
    pravo: { modul: "korisnici", razina: "pregled" },
    stupci: [
      { naslov: "Ime", vrijednost: (c) => c.ime },
      { naslov: "E-pošta", vrijednost: (c) => c.email },
      { naslov: "Uloga", vrijednost: (c) => c.uloga.naziv, sirina: 14 },
      { naslov: "Aktivan", vrijednost: (c) => (c.aktivan ? "da" : "ne"), sirina: 8 },
      { naslov: "Zadnja prijava", vrsta: "vrijeme", vrijednost: (c) => c.zadnjaPrijava },
    ],
    dohvati: async (k, _sp, najvise) => (await popisClanova(k.db, k.firmaId)).slice(0, najvise),
  } satisfies Izvor<Awaited<ReturnType<typeof popisClanova>>[number]>),
};
