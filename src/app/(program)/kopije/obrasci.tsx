"use client";

import { useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { klaseUnosa, Odabir, Polje } from "@/components/ui/polje";
import type { Odgovor } from "@/lib/greske";
import { izradiAkcija } from "./akcije";

function Poruka({ s }: { s: Odgovor | null }) {
  if (!s) return null;
  return s.ok ? <Obavijest vrsta="uspjeh">{s.poruka}</Obavijest> : <Obavijest vrsta="greska">{s.greska}</Obavijest>;
}

export function IzradiKopiju() {
  const [s, setS] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Gumb varijanta="primarni" disabled={uTijeku} onClick={() => zapocni(async () => setS(await izradiAkcija()))}>
          {uTijeku ? "Izrađujem…" : "Izradi kopiju sada"}
        </Gumb>
      </div>
      <Poruka s={s} />
    </div>
  );
}

/** Vraćanje ide API rutom (učitana datoteka može biti velika), uvijek u novu firmu. */
export function VratiKopiju({ kopije }: { kopije: { id: string; opis: string }[] }) {
  const [s, setS] = useState<Odgovor | null>(null);
  const [uTijeku, setUTijeku] = useState(false);
  return (
    <form
      aria-label="Vraćanje kopije"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (!confirm(`Vratiti kopiju u NOVU firmu „${String(fd.get("naziv"))}“? Postojeća firma se ne mijenja.`)) return;
        setUTijeku(true);
        void fetch("/api/kopije/vrati", { method: "POST", body: fd })
          .then(async (r) => (await r.json()) as { ok: boolean; greska?: string; redaka?: number })
          .then((r) =>
            setS(
              r.ok
                ? {
                    ok: true,
                    poruka: `Kopija je vraćena u novu firmu (${r.redaka} zapisa). Vi ste njen administrator — ostale korisnike dodajte u njoj.`,
                  }
                : { ok: false, greska: r.greska ?? "Greška." },
            ),
          )
          .catch(() => setS({ ok: false, greska: "Slanje nije uspjelo." }))
          .finally(() => setUTijeku(false));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Odabir oznaka="Kopija" name="kopijaId" defaultValue={kopije[0]?.id ?? ""}>
          <option value="">— iz datoteke —</option>
          {kopije.map((k) => (
            <option key={k.id} value={k.id}>
              {k.opis}
            </option>
          ))}
        </Odabir>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Ili datoteka kopije (.ndjson.gz)
          <input type="file" name="datoteka" accept=".gz,application/gzip" className={klaseUnosa} />
        </label>
        <Polje oznaka="Naziv nove firme" name="naziv" required maxLength={200} />
        <Polje oznaka="OIB nove firme" name="oib" required inputMode="numeric" maxLength={11} />
      </div>
      <div>
        <Gumb type="submit" disabled={uTijeku}>
          {uTijeku ? "Vraćam…" : "Vrati u novu firmu"}
        </Gumb>
      </div>
      <Poruka s={s} />
    </form>
  );
}
