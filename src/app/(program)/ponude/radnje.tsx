"use client";

import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { izdajAkcija, obrisiNacrtAkcija, pretvoriAkcija } from "./akcije";

function Radnja({
  akcija,
  oznaka,
  potvrda,
  varijanta = "sekundarni",
}: {
  akcija: () => Promise<{ ok: boolean; greska?: string } | undefined | void>;
  oznaka: string;
  potvrda?: string;
  varijanta?: "primarni" | "sekundarni" | "opasni";
}) {
  const [stanje, posalji, uTijeku] = useActionState(async () => (await akcija()) ?? undefined, undefined);
  return (
    <form
      action={posalji}
      onSubmit={(e) => {
        if (potvrda && !confirm(potvrda)) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <Gumb type="submit" varijanta={varijanta} disabled={uTijeku}>
        {oznaka}
      </Gumb>
      {stanje && !stanje.ok && stanje.greska && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
    </form>
  );
}

export function IzdajDokument({ id, naziv }: { id: string; naziv: string }) {
  return (
    <Radnja
      akcija={() => izdajAkcija(id)}
      oznaka={`Izdaj ${naziv}`}
      potvrda="Izdani dokument dobiva broj i više se ne može mijenjati. Izdati?"
      varijanta="primarni"
    />
  );
}

export function ObrisiNacrt({ id }: { id: string }) {
  return <Radnja akcija={() => obrisiNacrtAkcija(id)} oznaka="Obriši nacrt" potvrda="Obrisati nacrt?" varijanta="opasni" />;
}

export function Pretvori({ id, u, oznaka }: { id: string; u: string; oznaka: string }) {
  return <Radnja akcija={() => pretvoriAkcija(id, u)} oznaka={oznaka} />;
}
