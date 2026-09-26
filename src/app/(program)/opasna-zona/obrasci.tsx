"use client";

import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Odabir, Polje } from "@/components/ui/polje";
import { DNEVNIK_NAJMANJE_MJESECI, NACINI_BRISANJA } from "@/domain/opasna-zona";
import type { Odgovor } from "@/lib/greske";
import { dnevnikAkcija, obrisiAkcija } from "./akcije";

function Poruka({ s }: { s: Odgovor | undefined }) {
  if (!s) return null;
  return s.ok ? <Obavijest vrsta="uspjeh">{s.poruka}</Obavijest> : <Obavijest vrsta="greska">{s.greska}</Obavijest>;
}

export function CiscenjeDnevnika() {
  const [s, posalji, uTijeku] = useActionState(dnevnikAkcija, undefined);
  return (
    <Obrazac
      akcija={(fd) => {
        if (confirm(`Trajno obrisati zapise dnevnika starije od ${String(fd.get("mjeseci"))} mjeseci?`)) posalji(fd);
      }}
      className="flex flex-col gap-3"
      aria-label="Čišćenje dnevnika"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka="Obriši starije od (mjeseci)" name="mjeseci" type="number" min={DNEVNIK_NAJMANJE_MJESECI} defaultValue={36} required />
        <Polje oznaka="Vaša lozinka" name="lozinka" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Gumb type="submit" varijanta="opasni" disabled={uTijeku}>
          Očisti dnevnik
        </Gumb>
      </div>
      <Poruka s={s} />
    </Obrazac>
  );
}

export function BrisanjePodataka({ naziv }: { naziv: string }) {
  const [s, posalji, uTijeku] = useActionState(obrisiAkcija, undefined);
  return (
    <Obrazac
      akcija={(fd) => {
        if (confirm("Ovo se ne može poništiti (osim vraćanjem kopije u novu firmu). Nastaviti?")) posalji(fd);
      }}
      className="flex flex-col gap-3"
      aria-label="Brisanje podataka"
    >
      <Odabir oznaka="Što se briše" name="nacin" defaultValue="PROMET">
        {Object.entries(NACINI_BRISANJA).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Odabir>
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka={`Prepišite naziv firme: ${naziv}`} name="naziv" required autoComplete="off" />
        <Polje oznaka="Vaša lozinka" name="lozinka" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Gumb type="submit" varijanta="opasni" disabled={uTijeku}>
          {uTijeku ? "Brišem…" : "Obriši podatke"}
        </Gumb>
      </div>
      <Poruka s={s} />
    </Obrazac>
  );
}
