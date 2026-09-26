"use client";

import { useActionState, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Polje } from "@/components/ui/polje";
import type { Odgovor } from "@/lib/greske";
import { automatskoAkcija, izdajRateAkcija, izvanProgramaAkcija } from "./akcije";

function Poruka({ s }: { s: Odgovor | undefined }) {
  return s ? s.ok ? <Obavijest vrsta="uspjeh">{s.poruka}</Obavijest> : <Obavijest vrsta="greska">{s.greska}</Obavijest> : null;
}

/** Izdavanje rata ugovora do odabranog mjeseca (račun s današnjim datumom). */
export function IzdajRate({ ugovorId, mjesec, oznaka = "Izdaj račun" }: { ugovorId: string; mjesec: string; oznaka?: string }) {
  const [doMjeseca, setDoMjeseca] = useState(mjesec);
  const [stanje, posalji, uTijeku] = useActionState(() => izdajRateAkcija(ugovorId, doMjeseca), undefined);
  return (
    <form
      action={posalji}
      onSubmit={(e) => {
        if (!confirm(`Izdati račun za sve rate do ${doMjeseca.slice(5)}/${doMjeseca.slice(0, 4)}? Račun dobiva današnji datum.`)) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-end gap-2">
        <Polje oznaka="Do mjeseca" type="month" value={doMjeseca} onChange={(e) => setDoMjeseca(e.target.value)} className="w-40" />
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          {uTijeku ? "Izdajem…" : oznaka}
        </Gumb>
      </div>
      <Poruka s={stanje} />
    </form>
  );
}

export function IzvanPrograma({ ugovorId, planId, mjesec, izvan }: { ugovorId: string; planId: string; mjesec: string; izvan: boolean }) {
  const [stanje, posalji, uTijeku] = useActionState(() => izvanProgramaAkcija(ugovorId, planId, mjesec, izvan), undefined);
  return (
    <form action={posalji} className="inline-flex items-center gap-2">
      {stanje && !stanje.ok && <span className="text-xs text-red-700 dark:text-red-400">{stanje.greska}</span>}
      <Gumb type="submit" malen varijanta="tihi" disabled={uTijeku}>
        {izvan ? "Izdano izvan programa" : "Vrati"}
      </Gumb>
    </form>
  );
}

export function AutomatskoIzdavanje({
  ugovorId,
  ukljuceno,
  od,
  greska,
}: {
  ugovorId: string;
  ukljuceno: boolean;
  od: string | null;
  greska: string | null;
}) {
  const [stanje, posalji, uTijeku] = useActionState(() => automatskoAkcija(ugovorId, !ukljuceno), undefined);
  return (
    <form action={posalji} className="flex flex-col gap-2" data-testid="automatsko">
      <p className="text-sm">
        {ukljuceno
          ? `Automatsko izdavanje uključeno od ${od?.split("-").reverse().join(".")}. — rate se izdaju same (tekući mjesec, jednom).`
          : "Rate se izdaju ručno. Automatsko izdavanje izdaje samo rate od dana uključivanja."}
      </p>
      {ukljuceno && greska && <Obavijest vrsta="greska">Zadnji pokušaj nije uspio: {greska}</Obavijest>}
      <div>
        <Gumb type="submit" disabled={uTijeku}>
          {ukljuceno ? "Isključi automatsko izdavanje" : "Uključi automatsko izdavanje"}
        </Gumb>
      </div>
      <Poruka s={stanje} />
    </form>
  );
}
