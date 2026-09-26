"use client";

import { useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import type { Odgovor } from "@/lib/greske";
import { popraviAkcija } from "./akcije";

export function Popravi({ broj }: { broj: number }) {
  const [stanje, setStanje] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Gumb
        varijanta="primarni"
        disabled={uTijeku || broj === 0}
        onClick={() => {
          if (confirm(`Popraviti ${broj} odstupanja? Svaki popravak se zapisuje u dnevnik.`)) zapocni(async () => setStanje(await popraviAkcija()));
        }}
      >
        {uTijeku ? "Popravljam…" : `Popravi (${broj})`}
      </Gumb>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </div>
  );
}
