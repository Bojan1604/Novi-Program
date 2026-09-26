"use client";

import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { posaljiERacunAkcija, posaljiIzvjestajeAkcija, statusERacunaAkcija } from "./akcije-eracun";

function Radnja({
  akcija,
  oznaka,
  varijanta = "sekundarni",
}: {
  akcija: () => Promise<{ ok: boolean; greska?: string; poruka?: string }>;
  oznaka: string;
  varijanta?: "primarni" | "sekundarni";
}) {
  const [stanje, posalji, uTijeku] = useActionState(async () => await akcija(), undefined);
  return (
    <form action={posalji} className="flex flex-col gap-2">
      <Gumb type="submit" varijanta={varijanta} disabled={uTijeku}>
        {uTijeku ? "Šaljem…" : oznaka}
      </Gumb>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </form>
  );
}

export function PosaljiERacun({ id }: { id: string }) {
  return <Radnja akcija={() => posaljiERacunAkcija(id)} oznaka="Pošalji eRačun" varijanta="primarni" />;
}

export function OsvjeziStatus({ id }: { id: string }) {
  return <Radnja akcija={() => statusERacunaAkcija(id)} oznaka="Provjeri status" />;
}

export function PosaljiIzvjestaje() {
  return <Radnja akcija={() => posaljiIzvjestajeAkcija()} oznaka="Pošalji izvještaje sada" />;
}
