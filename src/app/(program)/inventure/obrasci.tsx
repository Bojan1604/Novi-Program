"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa, Odabir, Polje } from "@/components/ui/polje";
import { GumbiSkenera } from "@/components/ui/skener";
import { potvrdiSkeniranje } from "@/components/ui/skener-citac";
import { serijskiIzKoda } from "@/domain/skeniranje";
import { procitajSerijske } from "@/domain/zaprimanje";
import { otvoriInventuruAkcija, skenirajAkcija, ukloniAkcija, zakljuciAkcija } from "./akcije";

export function NovaInventura({ skladista, danas }: { skladista: { id: string; naziv: string }[]; danas: string }) {
  const [stanje, posalji, uTijeku] = useActionState(otvoriInventuruAkcija, undefined);
  return (
    <Obrazac akcija={posalji} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" aria-label="Nova inventura">
      <Odabir oznaka="Skladište" name="skladisteId" required>
        {skladista.map((s) => (
          <option key={s.id} value={s.id}>
            {s.naziv}
          </option>
        ))}
      </Odabir>
      <Polje oznaka="Datum" name="datum" defaultValue={danas.split("-").reverse().join(".") + "."} />
      <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
        Započni inventuru
      </Gumb>
      {stanje && !stanje.ok && (
        <div className="sm:col-span-3">
          <Obavijest vrsta="greska">{stanje.greska}</Obavijest>
        </div>
      )}
    </Obrazac>
  );
}

type Zadnji = { serijski: string; opis: string; rezultat: string; puta: number };

/** Skeniranje na polici: svaki sken odmah u bazu (ništa se ne gubi ako se mobitel ugasi). */
export function SkeniranjeInventure({ id }: { id: string }) {
  const router = useRouter();
  const [zadnji, setZadnji] = useState<Zadnji[]>([]);
  const [greska, setGreska] = useState<string | null>(null);
  const [zalijepi, setZalijepi] = useState("");
  const [, osvjezi] = useTransition();

  const posalji = async (serijski: string[]) => {
    if (!serijski.length) return;
    const r = await skenirajAkcija(id, serijski);
    if (!r.ok) {
      setGreska(r.greska);
      potvrdiSkeniranje(false);
      return;
    }
    setGreska(null);
    potvrdiSkeniranje(r.podaci.every((x) => x.rezultat === "PRONADJEN"));
    setZadnji((z) => [...r.podaci.slice().reverse(), ...z.filter((x) => !r.podaci.some((y) => y.serijski === x.serijski))].slice(0, 20));
    osvjezi(() => router.refresh());
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Serijski broj (skener ili upis, Enter)</span>
            <input
              autoFocus
              autoComplete="off"
              className={`${klaseUnosa} font-mono`}
              aria-label="Serijski broj"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const el = e.currentTarget;
                const s = serijskiIzKoda(el.value);
                if (s) void posalji([s]);
                else if (el.value.trim()) setGreska(`„${el.value.trim()}“ nije ispravan serijski broj.`);
                el.value = "";
              }}
            />
          </label>
          <GumbiSkenera skupno onSerijski={(s) => void posalji([s])} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Ili zalijepite popis (npr. iz ručnog skenera)</span>
            <textarea className={klaseUnosa} rows={3} value={zalijepi} onChange={(e) => setZalijepi(e.target.value)} />
          </label>
          <div>
            <Gumb
              malen
              onClick={() => {
                void posalji(procitajSerijske(zalijepi).flatMap((r) => (r.serijski ? [r.serijski] : [])));
                setZalijepi("");
              }}
            >
              Dodaj zalijepljene
            </Gumb>
          </div>
        </div>
      </div>
      {greska && <Obavijest vrsta="greska">{greska}</Obavijest>}
      {zadnji.length > 0 && (
        <ul
          className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900"
          aria-label="Zadnje skenirano"
          data-testid="zadnje-skenirano"
        >
          {zadnji.map((z) => (
            <li
              key={z.serijski}
              className={`flex flex-wrap justify-between gap-2 py-1 ${z.rezultat === "PRONADJEN" ? "" : "text-amber-800 dark:text-amber-300"}`}
            >
              <span className="font-mono">{z.serijski}</span>
              <span>
                {z.opis}
                {z.puta > 1 && ` · skenirano ${z.puta}×`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UkloniStavku({ id, serijski }: { id: string; serijski: string }) {
  const router = useRouter();
  const [uTijeku, zapocni] = useTransition();
  return (
    <Gumb
      malen
      varijanta="tihi"
      disabled={uTijeku}
      aria-label={`Ukloni ${serijski}`}
      onClick={() =>
        zapocni(async () => {
          await ukloniAkcija(id, serijski);
          router.refresh();
        })
      }
    >
      Ukloni
    </Gumb>
  );
}

export function Zakljuci({ id, skenirano, ocekivano }: { id: string; skenirano: number; ocekivano: number }) {
  const [stanje, posalji, uTijeku] = useActionState(() => zakljuciAkcija(id), undefined);
  return (
    <form
      action={posalji}
      onSubmit={(e) => {
        if (!confirm(`Zaključiti inventuru? Skenirano ${skenirano}, u programu ${ocekivano}. Nakon zaključenja ne može se više skenirati.`))
          e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      {stanje && !stanje.ok && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          Zaključi inventuru
        </Gumb>
      </div>
    </form>
  );
}
