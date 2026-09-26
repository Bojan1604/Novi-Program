"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Polje } from "@/components/ui/polje";
import type { Odgovor } from "@/lib/greske";
import { novaFirmaAkcija, odgovorAkcija, prebaciAkcija } from "./akcije";

function Poruka({ s }: { s: Odgovor | null | undefined }) {
  if (!s) return null;
  return s.ok ? <Obavijest vrsta="uspjeh">{s.poruka}</Obavijest> : <Obavijest vrsta="greska">{s.greska}</Obavijest>;
}

/** Odabir firme u zaglavlju (samo kad korisnik radi u više firmi). */
export function OdabirFirme({ firme, trenutna }: { firme: { id: string; naziv: string }[]; trenutna: string }) {
  const router = useRouter();
  const [uTijeku, zapocni] = useTransition();
  return (
    <select
      aria-label="Firma"
      data-testid="firma"
      className="max-w-48 truncate rounded border-none bg-transparent p-0 text-xs text-neutral-600 sm:max-w-72 dark:text-neutral-400"
      value={trenutna}
      disabled={uTijeku}
      onChange={(e) => {
        const id = e.target.value;
        zapocni(async () => {
          const r = await prebaciAkcija(id);
          if (r.ok) {
            router.push("/");
            router.refresh();
          } else alert(r.greska);
        });
      }}
    >
      {firme.map((f) => (
        <option key={f.id} value={f.id}>
          {f.naziv}
        </option>
      ))}
    </select>
  );
}

export function Prijedi({ id }: { id: string }) {
  const router = useRouter();
  const [s, setS] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Gumb
        malen
        disabled={uTijeku}
        onClick={() =>
          zapocni(async () => {
            const r = await prebaciAkcija(id);
            setS(r.ok ? null : r);
            if (r.ok) {
              router.push("/");
              router.refresh();
            }
          })
        }
      >
        Prijeđi
      </Gumb>
      <Poruka s={s} />
    </div>
  );
}

export function OdgovorNaPoziv({ token }: { token: string }) {
  const [s, setS] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  const odgovori = (prihvati: boolean) => zapocni(async () => setS(await odgovorAkcija(token, prihvati)));
  if (s?.ok) return <Poruka s={s} />;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Gumb malen varijanta="primarni" disabled={uTijeku} onClick={() => odgovori(true)}>
          Prihvati
        </Gumb>
        <Gumb malen varijanta="tihi" disabled={uTijeku} onClick={() => odgovori(false)}>
          Odbij
        </Gumb>
      </div>
      <Poruka s={s} />
    </div>
  );
}

export function NovaFirma() {
  const router = useRouter();
  const [s, posalji, uTijeku] = useActionState(async (p: Odgovor | undefined, fd: FormData) => {
    const r = await novaFirmaAkcija(p, fd);
    if (r.ok) router.refresh();
    return r;
  }, undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label="Nova firma">
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka="Naziv firme" name="naziv" required maxLength={200} />
        <Polje oznaka="OIB" name="oib" required inputMode="numeric" maxLength={11} />
      </div>
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          Napravi firmu
        </Gumb>
      </div>
      <Poruka s={s} />
    </Obrazac>
  );
}
