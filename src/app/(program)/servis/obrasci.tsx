"use client";

import { useActionState, useId } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa, Odabir, Polje } from "@/components/ui/polje";
import { OTVORENI_STATUSI, STATUSI_SERVISA } from "@/domain/servis";
import type { Odgovor } from "@/lib/greske";
import { dijagnozaAkcija, obrisiAkcija, otpisAkcija, povratZamjeneAkcija, statusAkcija, zamjenaAkcija, zaprimiAkcija, zavrsiAkcija } from "./akcije";

type Skladiste = { id: string; naziv: string };

function Poruka({ stanje }: { stanje: Odgovor | undefined }) {
  if (!stanje) return null;
  return stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>;
}

function Tekst({
  oznaka,
  name,
  defaultValue,
  rows = 3,
  required,
}: {
  oznaka: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {oznaka}
      </label>
      <textarea id={id} name={name} rows={rows} className={klaseUnosa} defaultValue={defaultValue} required={required} maxLength={5000} />
    </div>
  );
}

function OdabirSkladista({ skladista, oznaka = "Skladište", prazno }: { skladista: Skladiste[]; oznaka?: string; prazno?: string }) {
  return (
    <Odabir oznaka={oznaka} name="skladisteId" defaultValue={prazno ? "" : skladista[0]?.id}>
      {prazno && <option value="">{prazno}</option>}
      {skladista.map((s) => (
        <option key={s.id} value={s.id}>
          {s.naziv}
        </option>
      ))}
    </Odabir>
  );
}

export function NoviNalog({ danas, skladista, serijski }: { danas: string; skladista: Skladiste[]; serijski: string }) {
  const [stanje, posalji, uTijeku] = useActionState(zaprimiAkcija, undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label="Prijem na servis">
      <div className="grid gap-3 sm:grid-cols-3">
        <Polje oznaka="Serijski broj" name="serijski" required defaultValue={serijski} autoFocus={!serijski} />
        <Polje oznaka="Datum prijema" name="datum" type="date" required defaultValue={danas} />
        <OdabirSkladista skladista={skladista} oznaka="Gdje je uređaj" prazno="— kod servisa (bez skladišta) —" />
      </div>
      <Tekst oznaka="Opis kvara" name="opisKvara" required />
      <Polje oznaka="Kontakt (osoba, telefon)" name="kontakt" />
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          {uTijeku ? "Spremam…" : "Zaprimi na servis"}
        </Gumb>
      </div>
      <Poruka stanje={stanje} />
    </Obrazac>
  );
}

export function StatusNaloga({ id, verzija, status }: { id: string; verzija: number; status: string }) {
  const [stanje, posalji, uTijeku] = useActionState(statusAkcija.bind(null, id, verzija), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-2" aria-label="Status naloga">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Odabir oznaka="Status" name="status" defaultValue={status} className="sm:w-56">
          {OTVORENI_STATUSI.map((s) => (
            <option key={s} value={s}>
              {STATUSI_SERVISA[s]}
            </option>
          ))}
        </Odabir>
        <Polje oznaka="Poruka klijentu (neobavezno)" name="poruka" className="min-w-0 flex-1" />
        <Gumb type="submit" disabled={uTijeku}>
          Promijeni
        </Gumb>
      </div>
      <Poruka stanje={stanje} />
    </Obrazac>
  );
}

export function Dijagnoza({ id, verzija, dijagnoza, napomena }: { id: string; verzija: number; dijagnoza: string; napomena: string }) {
  const [stanje, posalji, uTijeku] = useActionState(dijagnozaAkcija.bind(null, id, verzija), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label="Dijagnoza">
      <Tekst oznaka="Dijagnoza (interno — klijent je nikad ne vidi)" name="dijagnoza" defaultValue={dijagnoza} rows={4} />
      <Tekst oznaka="Napomena klijentu (vidi se na portalu)" name="napomenaKlijentu" defaultValue={napomena} rows={2} />
      <div>
        <Gumb type="submit" disabled={uTijeku}>
          Spremi
        </Gumb>
      </div>
      <Poruka stanje={stanje} />
    </Obrazac>
  );
}

export function IzdajZamjenu({ id, danas }: { id: string; danas: string }) {
  const [stanje, posalji, uTijeku] = useActionState(zamjenaAkcija.bind(null, id), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-2" aria-label="Zamjenski uređaj">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Polje oznaka="Serijski zamjenskog (sa skladišta)" name="serijski" required className="min-w-0 flex-1" />
        <Polje oznaka="Datum" name="datum" type="date" required defaultValue={danas} />
        <Gumb type="submit" disabled={uTijeku}>
          Izdaj zamjenski
        </Gumb>
      </div>
      <Poruka stanje={stanje} />
    </Obrazac>
  );
}

export function VratiZamjenu({ id, danas, skladista }: { id: string; danas: string; skladista: Skladiste[] }) {
  const [stanje, posalji, uTijeku] = useActionState(povratZamjeneAkcija.bind(null, id), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-2" aria-label="Povrat zamjenskog uređaja">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <OdabirSkladista skladista={skladista} />
        <Polje oznaka="Datum" name="datum" type="date" required defaultValue={danas} />
        <Gumb type="submit" disabled={uTijeku}>
          Zamjenski vraćen
        </Gumb>
      </div>
      <Poruka stanje={stanje} />
    </Obrazac>
  );
}

export function Zavrsetak({
  id,
  danas,
  skladista,
  trebaSkladiste,
  smijeOtpis,
}: {
  id: string;
  danas: string;
  skladista: Skladiste[];
  /** zamjenski se vraća ili uređaj ide na skladište */
  trebaSkladiste: boolean;
  smijeOtpis: boolean;
}) {
  const [stanje, posalji, uTijeku] = useActionState(zavrsiAkcija.bind(null, id), undefined);
  const [otpis, posaljiOtpis, uTijekuOtpis] = useActionState(otpisAkcija.bind(null, id), undefined);
  const polja = (
    <>
      <Polje oznaka="Datum" name="datum" type="date" required defaultValue={danas} />
      {trebaSkladiste && <OdabirSkladista skladista={skladista} oznaka="Skladište (povrat na skladište)" />}
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      <Obrazac akcija={posalji} className="flex flex-col gap-2" aria-label="Završetak naloga">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Odabir oznaka="Ishod" name="ishod" defaultValue="VRACEN">
            <option value="VRACEN">Vraćen (popravljen ili ne)</option>
            <option value="OTKAZAN">Otkazan</option>
          </Odabir>
          {polja}
        </div>
        <Polje oznaka="Napomena klijentu (neobavezno)" name="napomena" />
        <div>
          <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
            Završi nalog
          </Gumb>
        </div>
        <Poruka stanje={stanje} />
      </Obrazac>
      {smijeOtpis && (
        <Obrazac
          akcija={(fd) => {
            if (confirm("Otpisati uređaj? Uređaj iz najma prestaje se naplaćivati (zamjenski ostaje u najmu umjesto njega).")) posaljiOtpis(fd);
          }}
          className="flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800"
          aria-label="Otpis uređaja"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            {polja}
            <Polje oznaka="Razlog otpisa" name="napomena" className="min-w-0 flex-1" />
            <Gumb type="submit" varijanta="opasni" disabled={uTijekuOtpis}>
              Otpiši uređaj
            </Gumb>
          </div>
          <Poruka stanje={otpis} />
        </Obrazac>
      )}
    </div>
  );
}

export function ObrisiNalog({ id }: { id: string }) {
  const [stanje, posalji, uTijeku] = useActionState(() => obrisiAkcija(id), undefined);
  return (
    <form
      action={posalji}
      onSubmit={(e) => {
        if (!confirm("Obrisati nalog? Uređaj se vraća u stanje prije servisa.")) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <div>
        <Gumb type="submit" varijanta="opasni" disabled={uTijeku}>
          Obriši nalog
        </Gumb>
      </div>
      <Poruka stanje={stanje} />
    </form>
  );
}
