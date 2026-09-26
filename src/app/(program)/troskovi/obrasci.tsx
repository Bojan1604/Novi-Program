"use client";

import { useActionState, useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Kvacica, Odabir, Polje } from "@/components/ui/polje";
import type { Odgovor } from "@/lib/greske";
import { kategorijaAkcija, obrisiTrosakAkcija, placenoAkcija, ponavljajuciAkcija, spremiTrosakAkcija, zaustaviAkcija } from "./akcije";

type Kategorija = { id: string; naziv: string };
const Poruka = ({ s }: { s: Odgovor | undefined | null }) =>
  s ? s.ok ? s.poruka ? <Obavijest vrsta="uspjeh">{s.poruka}</Obavijest> : null : <Obavijest vrsta="greska">{s.greska}</Obavijest> : null;

export function ObrazacTroska({
  id,
  kategorije,
  p,
}: {
  id: string | null;
  kategorije: Kategorija[];
  p: { datum: string; kategorijaId: string; opis: string; iznos: string; pdv: string; placeno: boolean };
}) {
  const [kljuc, setKljuc] = useState(0);
  const [stanje, posalji, uTijeku] = useActionState(async (s: Odgovor | undefined, fd: FormData) => {
    const r = await spremiTrosakAkcija(id, s, fd);
    if (r.ok && !id) setKljuc((x) => x + 1);
    return r;
  }, undefined);
  const g = (x: string) => (stanje && !stanje.ok ? stanje.polja?.[x] : undefined);
  return (
    <Obrazac key={kljuc} akcija={posalji} className="flex flex-col gap-3" aria-label={id ? "Trošak" : "Novi trošak"}>
      <div className="grid gap-2 sm:grid-cols-[9rem_1fr_1fr] sm:items-end">
        <Polje oznaka="Datum" name="datum" type="date" required defaultValue={p.datum} greska={g("datum")} />
        <Odabir oznaka="Kategorija" name="kategorijaId" defaultValue={p.kategorijaId} greska={g("kategorijaId")}>
          {kategorije.map((k) => (
            <option key={k.id} value={k.id}>
              {k.naziv}
            </option>
          ))}
        </Odabir>
        <Polje oznaka="Opis" name="opis" required defaultValue={p.opis} greska={g("opis")} />
      </div>
      <div className="grid gap-2 sm:grid-cols-[10rem_10rem_1fr_auto] sm:items-end">
        <Polje oznaka="Iznos bez PDV-a (€)" name="iznos" inputMode="decimal" required defaultValue={p.iznos} greska={g("iznos")} />
        <Polje oznaka="PDV (€)" name="pdv" inputMode="decimal" defaultValue={p.pdv} greska={g("pdv")} />
        <Kvacica name="placeno" oznaka="Plaćeno" defaultChecked={p.placeno} />
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          {id ? "Spremi" : "Dodaj trošak"}
        </Gumb>
      </div>
      <Poruka s={stanje} />
    </Obrazac>
  );
}

export function PlacenoTroska({ id, placeno, smijeObrisati }: { id: string; placeno: boolean; smijeObrisati: boolean }) {
  const [stanje, setStanje] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Gumb disabled={uTijeku} onClick={() => zapocni(async () => setStanje(await placenoAkcija(id, !placeno)))}>
          {placeno ? "Vrati na neplaćeno" : "Označi plaćeno"}
        </Gumb>
        {smijeObrisati && (
          <Gumb
            varijanta="opasni"
            disabled={uTijeku}
            onClick={() => {
              if (confirm("Obrisati trošak?")) zapocni(async () => setStanje(await obrisiTrosakAkcija(id)));
            }}
          >
            Obriši
          </Gumb>
        )}
      </div>
      <Poruka s={stanje} />
    </div>
  );
}

export function NoviPonavljajuci({ kategorije, mjesec }: { kategorije: Kategorija[]; mjesec: string }) {
  const [stanje, posalji, uTijeku] = useActionState(ponavljajuciAkcija, undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label="Ponavljajući trošak">
      <div className="grid gap-2 sm:grid-cols-3">
        <Odabir oznaka="Kategorija" name="kategorijaId">
          {kategorije.map((k) => (
            <option key={k.id} value={k.id}>
              {k.naziv}
            </option>
          ))}
        </Odabir>
        <Polje oznaka="Opis" name="opis" required />
        <Polje oznaka="Iznos bez PDV-a (€)" name="iznos" inputMode="decimal" required />
      </div>
      <div className="grid gap-2 sm:grid-cols-[8rem_8rem_10rem_10rem_auto] sm:items-end">
        <Polje oznaka="PDV (€)" name="pdv" inputMode="decimal" />
        <Polje oznaka="Dan u mjesecu" name="dan" inputMode="numeric" defaultValue="1" />
        <Polje oznaka="Od mjeseca" name="od" type="month" required defaultValue={mjesec} />
        <Polje oznaka="Do mjeseca" name="do" type="month" />
        <Gumb type="submit" disabled={uTijeku}>
          Spremi
        </Gumb>
      </div>
      <Poruka s={stanje} />
    </Obrazac>
  );
}

export function Zaustavi({ id }: { id: string }) {
  const [, zapocni] = useTransition();
  return (
    <Gumb malen varijanta="tihi" onClick={() => zapocni(async () => void (await zaustaviAkcija(id)))}>
      Zaustavi
    </Gumb>
  );
}

export function NovaKategorija() {
  const [stanje, posalji, uTijeku] = useActionState(kategorijaAkcija, undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-2" aria-label="Nova kategorija">
      <div className="flex flex-wrap items-end gap-2">
        <Polje oznaka="Nova kategorija" name="naziv" required />
        <Gumb type="submit" disabled={uTijeku}>
          Dodaj
        </Gumb>
      </div>
      <Poruka s={stanje} />
    </Obrazac>
  );
}
