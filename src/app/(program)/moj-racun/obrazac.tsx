"use client";

import { Obrazac } from "@/components/ui/obrazac";
import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Polje } from "@/components/ui/polje";
import { mojiPodaciAkcija, promijeniLozinkuAkcija } from "./akcije";

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

export function MojiPodaci({ ime, email }: { ime: string; email: string }) {
  const [stanje, akcija, uTijeku] = useActionState(mojiPodaciAkcija, undefined);
  return (
    <Obrazac akcija={akcija} className="flex flex-col gap-3" aria-label="Moji podaci">
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka="Ime i prezime" name="ime" required defaultValue={ime} />
        <Polje oznaka="E-pošta (za prijavu)" name="email" type="email" required defaultValue={email} />
      </div>
      <Polje oznaka="Trenutna lozinka" name="lozinka" type="password" autoComplete="current-password" required />
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      <div>
        <Gumb type="submit" disabled={uTijeku}>
          Spremi
        </Gumb>
      </div>
    </Obrazac>
  );
}
