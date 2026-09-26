"use client";

import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Polje } from "@/components/ui/polje";
import { prijavaPortalaAkcija } from "../akcije";

export function ObrazacPrijavePortala() {
  const [stanje, posalji, uTijeku] = useActionState(prijavaPortalaAkcija, undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label="Prijava na portal">
      <Polje oznaka="E-pošta" name="email" type="email" autoComplete="username" required defaultValue={stanje?.email} />
      <Polje oznaka="Lozinka" name="lozinka" type="password" autoComplete="current-password" required />
      {stanje?.greska && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
      <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
        {uTijeku ? "Prijava…" : "Prijava"}
      </Gumb>
    </Obrazac>
  );
}
