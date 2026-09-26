import "server-only";
import { jedan, vise, type ParametriUrl } from "@/domain/popis";
import { imaPosebno, type PotrebnoPravo } from "@/domain/prava";
import type { Kontekst } from "@/lib/akcija";
import { dnevnikZaIzvoz } from "@/queries/dnevnik";
import { popisClanova } from "@/queries/korisnici";
import { uvjetPartnera } from "@/queries/partneri";
import { uvjetPrimki } from "@/queries/primke";
import { modeliZaPretragu, uvjetUredaja } from "@/queries/uredaji";
import { STANJA, type Stanje } from "@/domain/stanja-uredaja";
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

  uredaji: izvor({
    naslov: "Uređaji",
    pravo: { modul: "uredaji", razina: "pregled" },
    stupci: [
      { naslov: "Serijski", vrijednost: (u) => u.serijski, sirina: 16 },
      { naslov: "Proizvođač", vrijednost: (u) => u.model.proizvodjac.naziv, sirina: 12 },
      { naslov: "Model", vrijednost: (u) => u.model.naziv },
      { naslov: "Kategorija", vrijednost: (u) => u.model.kategorija.naziv, sirina: 14 },
      { naslov: "Stanje", vrijednost: (u) => STANJA[u.stanje as Stanje], sirina: 12 },
      { naslov: "Skladište", vrijednost: (u) => u.skladiste?.naziv ?? "", sirina: 14 },
      { naslov: "Kupac", vrijednost: (u) => u.partner?.naziv ?? "" },
      {
        naslov: "Nabavna cijena",
        vrsta: "iznos",
        osjetljivo: true,
        vrijednost: (u) => (u.nabavnaCijena ? centiIzDecimala(u.nabavnaCijena.toString()) : null),
      },
      { naslov: "Zaprimljen", vrsta: "datum", vrijednost: (u) => u.nabavniDatum?.toISOString().slice(0, 10) ?? null },
      { naslov: "Jamstvo do", vrsta: "datum", vrijednost: (u) => u.jamstvoDo?.toISOString().slice(0, 10) ?? null },
      { naslov: "Primka", vrijednost: (u) => u.primka?.broj ?? "", sirina: 12 },
      { naslov: "Procesor", vrijednost: (u) => u.cpu, sirina: 14 },
      { naslov: "RAM", vrijednost: (u) => u.ram, sirina: 8 },
      { naslov: "Disk", vrijednost: (u) => u.disk, sirina: 10 },
      { naslov: "OS", vrijednost: (u) => u.os, sirina: 12 },
    ],
    dohvati: async (k, sp, najvise) =>
      k.db.uredaj.findMany({
        where: uvjetUredaja(
          k.firmaId,
          {
            trazi: jedan(sp["trazi"]),
            stanje: vise(sp["stanje"]),
            skladiste: vise(sp["skladiste"]),
            kategorija: vise(sp["kategorija"]),
            proizvodjac: vise(sp["proizvodjac"]),
            partnerId: jedan(sp["partner"]),
            primkaId: jedan(sp["primka"]),
            serijski: vise(sp["serijski"]),
            od: jedan(sp["od"]),
            do: jedan(sp["do"]),
            jamstvoDo: jedan(sp["jamstvoDo"]),
          },
          await modeliZaPretragu(k.db, k.firmaId, jedan(sp["trazi"])),
        ),
        orderBy: { serijski: "asc" },
        take: najvise,
        include: {
          model: { select: { naziv: true, proizvodjac: { select: { naziv: true } }, kategorija: { select: { naziv: true } } } },
          skladiste: { select: { naziv: true } },
          partner: { select: { naziv: true } },
          primka: { select: { broj: true } },
        },
      }),
  } satisfies Izvor<{
    serijski: string;
    stanje: string;
    model: { naziv: string; proizvodjac: { naziv: string }; kategorija: { naziv: string } };
    skladiste: { naziv: string } | null;
    partner: { naziv: string } | null;
    primka: { broj: string } | null;
    nabavnaCijena: { toString(): string } | null;
    nabavniDatum: Date | null;
    jamstvoDo: Date | null;
    cpu: string | null;
    ram: string | null;
    disk: string | null;
    os: string | null;
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
