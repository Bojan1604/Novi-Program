"use client";

import { useState, useTransition } from "react";
import { Gumb, klaseGumba } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Polje } from "@/components/ui/polje";
import type { Odgovor } from "@/lib/greske";
import { oznaciPoslanoAkcija, posaljiAkcija } from "./akcije";

export function RadnjeKnjigovodje({ mjesec, eposta, smije, smtp }: { mjesec: string; eposta: string; smije: boolean; smtp: boolean }) {
  const [prima, setPrima] = useState(eposta);
  const [stanje, setStanje] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <a href={`/api/knjigovodja/zip?mjesec=${mjesec}`} className={klaseGumba("primarni")}>
          Preuzmi ZIP
        </a>
        {smije && (
          <Gumb disabled={uTijeku} onClick={() => zapocni(async () => setStanje(await oznaciPoslanoAkcija(mjesec)))}>
            Označi poslano
          </Gumb>
        )}
      </div>
      {smije && smtp && (
        <div className="flex flex-wrap items-end gap-2">
          <Polje oznaka="E-pošta knjigovođe" type="email" value={prima} onChange={(e) => setPrima(e.target.value)} />
          <Gumb disabled={uTijeku || !prima} onClick={() => zapocni(async () => setStanje(await posaljiAkcija(mjesec, prima)))}>
            {uTijeku ? "Šaljem…" : "Pošalji e-poštom"}
          </Gumb>
        </div>
      )}
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </div>
  );
}
