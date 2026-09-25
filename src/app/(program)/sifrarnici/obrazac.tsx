"use client";

import { Obrazac } from "@/components/ui/obrazac";
import { useActionState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { PoljaObrasca } from "@/components/ui/polja-obrasca";
import { usePoruke } from "@/components/ui/poruke";
import type { Polje, Vrijednost } from "@/domain/polja";
import { aktivnostSifrarnikaAkcija, obrisiSifrarnikAkcija, spremiSifrarnikAkcija } from "./akcije";

export function ObrazacSifrarnika({
  kljuc,
  id,
  polja,
  vrijednosti,
  opcije,
  smijeUredivati,
}: {
  kljuc: string;
  id: string | null;
  polja: Polje[];
  vrijednosti: Record<string, Vrijednost>;
  opcije: Record<string, { vrijednost: string; naziv: string }[]>;
  smijeUredivati: boolean;
}) {
  const [stanje, akcija, uTijeku] = useActionState(spremiSifrarnikAkcija.bind(null, kljuc, id), undefined);
  return (
    <Obrazac akcija={akcija} className="flex flex-col gap-4" noValidate>
      <fieldset disabled={!smijeUredivati || uTijeku} className="flex min-w-0 flex-col gap-4">
        <PoljaObrasca polja={polja} vrijednosti={vrijednosti} opcije={opcije} greske={stanje && !stanje.ok ? stanje.polja : undefined} />
        {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
        {smijeUredivati && (
          <div>
            <Gumb type="submit" varijanta="primarni">
              {id ? "Spremi" : "Dodaj"}
            </Gumb>
          </div>
        )}
      </fieldset>
    </Obrazac>
  );
}

export function AkcijeZapisa({ kljuc, id, aktivan, smijeBrisati }: { kljuc: string; id: string; aktivan: boolean; smijeBrisati: boolean }) {
  const [uTijeku, zapocni] = useTransition();
  const poruka = usePoruke();
  return (
    <div className="flex flex-wrap gap-2">
      <Gumb
        disabled={uTijeku}
        onClick={() =>
          zapocni(async () => {
            const r = await aktivnostSifrarnikaAkcija(kljuc, id, !aktivan);
            poruka(r.ok ? (r.poruka ?? "") : r.greska, r.ok ? "uspjeh" : "greska");
          })
        }
      >
        {aktivan ? "Deaktiviraj" : "Aktiviraj"}
      </Gumb>
      {smijeBrisati && (
        <Gumb
          varijanta="opasni"
          disabled={uTijeku}
          onClick={() => {
            if (!confirm("Obrisati zapis? Moguće samo ako se nigdje ne koristi.")) return;
            zapocni(async () => {
              const r = await obrisiSifrarnikAkcija(kljuc, id);
              if (r && !r.ok) poruka(r.greska, "greska");
            });
          }}
        >
          Obriši
        </Gumb>
      )}
    </div>
  );
}
