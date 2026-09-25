"use client";

import { Obrazac } from "@/components/ui/obrazac";
import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Polje } from "@/components/ui/polje";
import { promijeniLozinkuAkcija } from "./akcije";

export function PromjenaLozinke() {
  const [stanje, akcija, uTijeku] = useActionState(promijeniLozinkuAkcija, undefined);
  return (
    <Obrazac akcija={akcija} className="flex flex-col gap-3" key={stanje?.ok ? "gotovo" : "obrazac"}>
      <Polje oznaka="Trenutna lozinka" name="trenutna" type="password" autoComplete="current-password" required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka="Nova lozinka" name="nova" type="password" autoComplete="new-password" required opis="Najmanje 10 znakova." />
        <Polje oznaka="Ponovite novu lozinku" name="ponovljena" type="password" autoComplete="new-password" required />
      </div>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          Promijeni lozinku
        </Gumb>
      </div>
    </Obrazac>
  );
}
