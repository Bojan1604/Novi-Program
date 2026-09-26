"use client";

import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa } from "@/components/ui/polje";
import { odluciAkcija } from "./akcije";

/** Odobri / odbij zahtjev (razlog obavezan kod odbijanja). */
export function Odluka({ odobrenjeId }: { odobrenjeId: string }) {
  const [stanje, posalji, uTijeku] = useActionState(odluciAkcija.bind(null, odobrenjeId), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-2" aria-label="Odluka o zahtjevu">
      <input name="razlog" className={klaseUnosa} placeholder="Razlog (obavezno kod odbijanja)" maxLength={500} aria-label="Razlog" />
      <div className="flex flex-wrap gap-2">
        <Gumb type="submit" name="odluka" value="odobri" varijanta="primarni" disabled={uTijeku}>
          Odobri
        </Gumb>
        <Gumb type="submit" name="odluka" value="odbij" varijanta="opasni" disabled={uTijeku}>
          Odbij
        </Gumb>
      </div>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </Obrazac>
  );
}
