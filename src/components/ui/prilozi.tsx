"use client";

import { useActionState, useState } from "react";
import { NAJVECI_PRILOG } from "@/domain/prilozi";
import type { Odgovor } from "@/lib/greske";
import { Gumb } from "./gumb";
import { Obavijest } from "./obavijest";
import { Obrazac } from "./obrazac";
import { klaseUnosa } from "./polje";

/** Dodavanje priloga uz bilo koji zapis: `akcija` je poslužiteljska akcija vezana na zapis (bind). */
export function DodajPriloge({ akcija }: { akcija: (p: Odgovor | undefined, fd: FormData) => Promise<Odgovor> }) {
  const [kljuc, setKljuc] = useState(0);
  const [prevelike, setPrevelike] = useState<string | null>(null);
  const [stanje, posalji, uTijeku] = useActionState(async (p: Odgovor | undefined, fd: FormData) => {
    const r = await akcija(p, fd);
    if (r.ok) setKljuc((x) => x + 1);
    return r;
  }, undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-2" key={kljuc} aria-label="Dodavanje priloga">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Datoteke (PDF, slike, Office… do 10 MB)</span>
          <input
            type="file"
            name="datoteke"
            multiple
            required
            className={klaseUnosa}
            onChange={(e) => {
              const vel = [...(e.currentTarget.files ?? [])].filter((f) => f.size > NAJVECI_PRILOG).map((f) => f.name);
              setPrevelike(vel.length ? `Veće od 10 MB: ${vel.join(", ")}` : null);
            }}
          />
        </label>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku || !!prevelike}>
          {uTijeku ? "Šaljem…" : "Dodaj"}
        </Gumb>
      </div>
      {prevelike && <Obavijest vrsta="greska">{prevelike}</Obavijest>}
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </Obrazac>
  );
}

export function ObrisiPrilog({ akcija, naziv }: { akcija: () => Promise<Odgovor>; naziv: string }) {
  const [stanje, posalji, uTijeku] = useActionState(() => akcija(), undefined);
  return (
    <form
      action={posalji}
      onSubmit={(e) => {
        if (!confirm(`Obrisati prilog „${naziv}“?`)) e.preventDefault();
      }}
      className="inline-flex items-center gap-2"
    >
      {stanje && !stanje.ok && <span className="text-sm text-red-700 dark:text-red-400">{stanje.greska}</span>}
      <Gumb type="submit" malen varijanta="tihi" disabled={uTijeku} aria-label={`Obriši prilog ${naziv}`}>
        Obriši
      </Gumb>
    </form>
  );
}
