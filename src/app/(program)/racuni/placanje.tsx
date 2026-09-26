"use client";

import { useActionState, useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Odabir, Polje } from "@/components/ui/polje";
import { formatirajIznos } from "@/domain/novac";
import { ponistiUplatuAkcija, uplataAkcija } from "./akcije";

export function UnosUplate({ dokumentId, otvoreno, zaPovrat, danas }: { dokumentId: string; otvoreno: number; zaPovrat: number; danas: string }) {
  const [vrsta, setVrsta] = useState<"uplata" | "povrat">(zaPovrat > 0 ? "povrat" : "uplata");
  const [stanje, posalji, uTijeku] = useActionState(uplataAkcija.bind(null, dokumentId), undefined);
  const g = (p: string) => (stanje && !stanje.ok ? stanje.polja?.[p] : undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label="Upis uplate">
      <input type="hidden" name="vrsta" value={vrsta} />
      {zaPovrat > 0 && (
        <div
          className="inline-flex overflow-hidden rounded-md border border-neutral-300 text-sm dark:border-neutral-700"
          role="group"
          aria-label="Vrsta"
        >
          {(["uplata", "povrat"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vrsta === v}
              onClick={() => setVrsta(v)}
              className={`px-3 py-1.5 ${vrsta === v ? "bg-primarna text-primarna-tekst" : ""}`}
            >
              {v === "uplata" ? "Uplata" : "Povrat kupcu"}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <Polje oznaka="Datum" name="datum" defaultValue={danas.split("-").reverse().join(".") + "."} greska={g("datum")} />
        <Polje
          oznaka={vrsta === "povrat" ? "Iznos povrata (€)" : "Iznos (€)"}
          name="iznos"
          inputMode="decimal"
          defaultValue={formatirajIznos(vrsta === "povrat" ? zaPovrat : otvoreno)}
          key={vrsta}
          greska={g("iznos")}
        />
        <Odabir oznaka="Način" name="nacin" defaultValue="T">
          <option value="T">Transakcijski račun</option>
          <option value="G">Gotovina</option>
          <option value="K">Kartica</option>
          <option value="O">Ostalo</option>
        </Odabir>
        <Polje oznaka="Opis (neobavezno)" name="opis" placeholder="npr. izvod 123" />
      </div>
      {stanje &&
        (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : !stanje.polja && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          {vrsta === "povrat" ? "Upiši povrat kupcu" : "Upiši uplatu"}
        </Gumb>
      </div>
    </Obrazac>
  );
}

export function PonistiUplatu({ dokumentId, uplataId, iznos }: { dokumentId: string; uplataId: string; iznos: number }) {
  const [greska, setGreska] = useState<string | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      {greska && <span className="text-xs text-red-700 dark:text-red-400">{greska}</span>}
      <Gumb
        malen
        varijanta="tihi"
        disabled={uTijeku}
        aria-label={`Poništi uplatu ${formatirajIznos(iznos)} €`}
        onClick={() => {
          const razlog = prompt("Razlog poništavanja uplate:");
          if (!razlog?.trim()) return;
          zapocni(async () => {
            const r = await ponistiUplatuAkcija(dokumentId, uplataId, razlog);
            setGreska(r.ok ? null : r.greska);
          });
        }}
      >
        Poništi
      </Gumb>
    </span>
  );
}
