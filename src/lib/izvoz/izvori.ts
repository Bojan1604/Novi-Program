import "server-only";
import { jedan, type ParametriUrl } from "@/domain/popis";
import { imaPosebno, type PotrebnoPravo } from "@/domain/prava";
import type { Kontekst } from "@/lib/akcija";
import { dnevnikZaIzvoz } from "@/queries/dnevnik";
import { popisClanova } from "@/queries/korisnici";
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
