"use client";

import { useActionState, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { klaseUnosa } from "@/components/ui/polje";
import {
  dodajPredujamAkcija,
  izdajAkcija,
  obrisiNacrtAkcija,
  odobrenjeAkcija,
  ponoviFiskalizacijuAkcija,
  pretvoriAkcija,
  stornoAkcija,
  ugovorNacrtaAkcija,
} from "./akcije";

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

export function OdbijPredujam({ racunId, predujamId, broj }: { racunId: string; predujamId: string; broj: string }) {
  return <Radnja akcija={() => dodajPredujamAkcija(racunId, predujamId)} oznaka={`Odbij predujam ${broj}`} />;
}

export function PonoviFiskalizaciju({ id }: { id: string }) {
  return <Radnja akcija={() => ponoviFiskalizacijuAkcija(id)} oznaka="Ponovi fiskalizaciju" />;
}

/** Nacrt računa s najmom uređaja: na koji ugovor ide najam. */
export function UgovorNajmaNacrta({ id, ugovori, odabran }: { id: string; ugovori: { id: string; broj: string }[]; odabran: string | null }) {
  const [vrijednost, setVrijednost] = useState(odabran ?? "");
  const [stanje, posalji, uTijeku] = useActionState(() => ugovorNacrtaAkcija(id, vrijednost), undefined);
  return (
    <form action={posalji} className="flex flex-col gap-2" aria-label="Ugovor o najmu">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Najam uređaja ide na ugovor</span>
          <select className={klaseUnosa} value={vrijednost} onChange={(e) => setVrijednost(e.target.value)}>
            <option value="">Novi ugovor (otvara se pri izdavanju)</option>
            {ugovori.map((u) => (
              <option key={u.id} value={u.id}>
                {u.broj}
              </option>
            ))}
          </select>
        </label>
        <Gumb type="submit" disabled={uTijeku}>
          Spremi
        </Gumb>
      </div>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </form>
  );
}
