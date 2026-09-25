"use client";

import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Polje } from "@/components/ui/polje";
import { MODULI, NAZIVI_RAZINA, POSEBNA, POPIS_MODULA, POPIS_POSEBNIH, RAZINE, type Prava } from "@/domain/prava";
import { obrisiUloguAkcija, spremiUloguAkcija } from "./akcije";

export function ObrazacUloge({
  id,
  naziv,
  opis,
  prava,
  samoPregled,
}: {
  id: string | null;
  naziv: string;
  opis: string;
  prava: Prava;
  samoPregled: boolean;
}) {
  const [stanje, akcija, uTijeku] = useActionState(spremiUloguAkcija.bind(null, id), undefined);
  return (
    <form action={akcija} className="flex flex-col gap-4">
      <fieldset disabled={samoPregled || uTijeku} className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Polje oznaka="Naziv" name="naziv" defaultValue={naziv} required />
          <Polje oznaka="Opis" name="opis" defaultValue={opis} />
        </div>
        <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" role="group" aria-label="Prava po modulima">
          {POPIS_MODULA.map((m) => (
            <div key={m} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{MODULI[m]}</span>
              <div className="grid grid-cols-4 overflow-hidden rounded-md border border-neutral-300 text-xs sm:w-96 dark:border-neutral-700">
                {RAZINE.map((r) => (
                  <label
                    key={r}
                    className="cursor-pointer border-l border-neutral-300 px-1 py-1.5 text-center first:border-l-0 has-checked:bg-primarna has-checked:text-primarna-tekst has-focus-visible:outline-2 has-focus-visible:outline-primarna dark:border-neutral-700"
                  >
                    <input type="radio" name={`modul.${m}`} value={r} defaultChecked={prava.moduli[m] === r} aria-label={`${MODULI[m]}: ${NAZIVI_RAZINA[r]}`} className="sr-only" />
                    {NAZIVI_RAZINA[r]}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium">Posebna prava</div>
          {POPIS_POSEBNIH.map((p) => (
            <label key={p} className="inline-flex min-h-9 items-center gap-2 text-sm">
              <input type="checkbox" name={`posebno.${p}`} defaultChecked={prava.posebna[p]} className="size-4 accent-primarna" />
              {POSEBNA[p]}
            </label>
          ))}
        </div>
        {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
        {!samoPregled && (
          <div>
            <Gumb type="submit" varijanta="primarni">
              {id ? "Spremi" : "Napravi ulogu"}
            </Gumb>
          </div>
        )}
      </fieldset>
    </form>
  );
}

export function ObrisiUlogu({ id }: { id: string }) {
  const [stanje, akcija, uTijeku] = useActionState(obrisiUloguAkcija.bind(null, id), undefined);
  return (
    <form
      action={akcija}
      onSubmit={(e) => {
        if (!confirm("Obrisati ulogu?")) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      {stanje && !stanje.ok && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
      <div>
        <Gumb type="submit" varijanta="opasni" disabled={uTijeku}>
          Obriši ulogu
        </Gumb>
      </div>
    </form>
  );
}
