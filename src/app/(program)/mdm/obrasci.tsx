"use client";

import { useActionState, useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Kvacica, Odabir, Polje } from "@/components/ui/polje";
import { VRSTE_ORGANIZACIJA } from "@/domain/mdm";
import type { Odgovor } from "@/lib/greske";
import { noviKodAkcija, ponovniUpisAkcija, spremiOrganizacijuAkcija, stanjeUredajaAkcija } from "./akcije";

type Opcija = { id: string; naziv: string };

function Poruka({ s }: { s: Odgovor | null | undefined }) {
  if (!s) return null;
  return s.ok ? <Obavijest vrsta="uspjeh">{s.poruka}</Obavijest> : <Obavijest vrsta="greska">{s.greska}</Obavijest>;
}

export function ObrazacOrganizacije({
  id,
  pocetno,
  distributeri,
  partneri,
}: {
  id: string | null;
  pocetno: { naziv: string; vrsta: string; nadredenaId: string; partnerId: string; aktivna: boolean };
  distributeri: Opcija[];
  partneri: Opcija[];
}) {
  const [stanje, posalji, uTijeku] = useActionState(spremiOrganizacijuAkcija.bind(null, id), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label={id ? "Organizacija" : "Nova organizacija"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka="Naziv" name="naziv" required defaultValue={pocetno.naziv} />
        <Odabir oznaka="Vrsta" name="vrsta" defaultValue={pocetno.vrsta}>
          {Object.entries(VRSTE_ORGANIZACIJA).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </Odabir>
        <Odabir oznaka="Pod distributerom" name="nadredenaId" defaultValue={pocetno.nadredenaId}>
          <option value="">— izravno (bez distributera) —</option>
          {distributeri
            .filter((d) => d.id !== id)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.naziv}
              </option>
            ))}
        </Odabir>
        <Odabir oznaka="Partner (pristup na portalu)" name="partnerId" defaultValue={pocetno.partnerId}>
          <option value="">— bez pristupa na portalu —</option>
          {partneri.map((p) => (
            <option key={p.id} value={p.id}>
              {p.naziv}
            </option>
          ))}
        </Odabir>
      </div>
      {id && <Kvacica oznaka="Aktivna (upis i javljanje uređaja)" name="aktivna" defaultChecked={pocetno.aktivna} />}
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          {id ? "Spremi" : "Dodaj organizaciju"}
        </Gumb>
      </div>
      <Poruka s={stanje} />
    </Obrazac>
  );
}

export function NoviKod({ id }: { id: string }) {
  const [s, setS] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Gumb
          malen
          disabled={uTijeku}
          onClick={() => {
            if (confirm("Novi kod? Stari kod i QR više neće vrijediti za nove upise.")) zapocni(async () => setS(await noviKodAkcija(id)));
          }}
        >
          Novi kod
        </Gumb>
      </div>
      <Poruka s={s} />
    </div>
  );
}

export function StanjeMdmUredaja({ id, blokiran }: { id: string; blokiran: boolean }) {
  const [s, setS] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Gumb
          varijanta={blokiran ? "sekundarni" : "opasni"}
          disabled={uTijeku}
          onClick={() => {
            if (blokiran || confirm("Blokirati uređaj? Agent odmah gubi pristup."))
              zapocni(async () => setS(await stanjeUredajaAkcija(id, !blokiran)));
          }}
        >
          {blokiran ? "Odblokiraj" : "Blokiraj"}
        </Gumb>
      </div>
      <Poruka s={s} />
    </div>
  );
}

export function PonovniUpis({ id, dopusten }: { id: string; dopusten: boolean }) {
  const [s, setS] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  if (dopusten && !s) return <p className="text-sm text-neutral-500">Ponovni upis je dopušten (jednom).</p>;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Gumb disabled={uTijeku || !!s?.ok} onClick={() => zapocni(async () => setS(await ponovniUpisAkcija(id)))}>
          Dopusti ponovni upis
        </Gumb>
      </div>
      <Poruka s={s} />
    </div>
  );
}
