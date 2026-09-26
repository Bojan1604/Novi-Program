"use client";

import { useActionState, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { klaseUnosa } from "@/components/ui/polje";
import { izdajAkcija, obrisiNacrtAkcija, odobrenjeAkcija, pretvoriAkcija, stornoAkcija } from "./akcije";

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

export function Odobrenje({ id }: { id: string }) {
  return <Radnja akcija={() => odobrenjeAkcija(id)} oznaka="Odobrenje" />;
}

export function Storniraj({ id, skladista }: { id: string; skladista: { id: string; naziv: string }[] }) {
  const [skladiste, setSkladiste] = useState(skladista[0]?.id ?? "");
  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-neutral-500">Uređaji na skladište</span>
        <select className={klaseUnosa} value={skladiste} onChange={(e) => setSkladiste(e.target.value)} aria-label="Skladište za vraćene uređaje">
          {skladista.map((s) => (
            <option key={s.id} value={s.id}>
              {s.naziv}
            </option>
          ))}
        </select>
      </label>
      <Radnja
        akcija={() => stornoAkcija(id, skladiste)}
        oznaka="Storniraj"
        potvrda="Stornirati račun? Nastaje storno u istom nizu brojeva, prodani uređaji se vraćaju na skladište."
        varijanta="opasni"
      />
    </div>
  );
}
