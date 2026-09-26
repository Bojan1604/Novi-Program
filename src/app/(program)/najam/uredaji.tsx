"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa, Polje } from "@/components/ui/polje";
import { dodajUredajeAkcija, postaviCijenuAkcija } from "./akcije";

export type RedakPlana = {
  id: string;
  uredajId: string;
  serijski: string;
  naziv: string;
  od: string;
  do: string | null;
  izvor: string;
  cijena: string;
  /** iznosi po mjesecima za prikaz: [mjesec, iznos, fakturirano] */
  rate: [string, string, boolean][];
};

const fmtDan = (x: string) => x.split("-").reverse().join(".") + ".";

export function UredajiUgovora({
  ugovorId,
  redovi,
  mjeseci,
  smije,
  prvaNeizdana,
}: {
  ugovorId: string;
  redovi: RedakPlana[];
  mjeseci: string[];
  smije: boolean;
  prvaNeizdana: string;
}) {
  const [odabrani, setOdabrani] = useState<Set<string>>(new Set());
  const [stanje, posalji, uTijeku] = useActionState(
    (p: Awaited<ReturnType<typeof postaviCijenuAkcija>> | undefined, fd: FormData) => postaviCijenuAkcija(ugovorId, [...odabrani], p, fd),
    undefined,
  );
  const svi = redovi.length > 0 && odabrani.size === redovi.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="uredaji-ugovora">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
              {smije && (
                <th className="py-1 pr-2">
                  <input
                    type="checkbox"
                    aria-label="Odaberi sve"
                    checked={svi}
                    onChange={() => setOdabrani(svi ? new Set() : new Set(redovi.map((r) => r.id)))}
                  />
                </th>
              )}
              <th className="py-1 pr-2">Uređaj</th>
              <th className="py-1 pr-2">Od – do</th>
              <th className="py-1 pr-2 text-right">€/mj.</th>
              {mjeseci.map((m) => (
                <th key={m} className="py-1 pr-2 text-right">
                  {m.slice(5)}/{m.slice(2, 4)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {redovi.map((r) => (
              <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-900">
                {smije && (
                  <td className="py-1 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`Odaberi ${r.serijski}`}
                      checked={odabrani.has(r.id)}
                      onChange={() =>
                        setOdabrani((s) => {
                          const n = new Set(s);
                          if (n.has(r.id)) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })
                      }
                    />
                  </td>
                )}
                <td className="py-1 pr-2">
                  <Link href={`/uredaji/${r.uredajId}`} className="font-mono text-primarna hover:underline">
                    {r.serijski}
                  </Link>
                  <div className="text-xs text-neutral-500">
                    {r.naziv}
                    {r.izvor === "KLIJENT" ? " · bio kod klijenta" : ""}
                  </div>
                </td>
                <td className="py-1 pr-2 text-xs whitespace-nowrap">
                  {fmtDan(r.od)} – {r.do ? fmtDan(r.do) : "…"}
                </td>
                <td className="py-1 pr-2 text-right">{r.cijena}</td>
                {r.rate.map(([m, iznos, fakt]) => (
                  <td key={m} className={`py-1 pr-2 text-right ${fakt ? "font-medium" : "text-neutral-500"}`} title={fakt ? "s računa" : "plan"}>
                    {iznos}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {redovi.length === 0 && <p className="text-sm text-neutral-500">Na ugovoru još nema uređaja.</p>}
      {smije && odabrani.size > 0 && (
        <Obrazac
          akcija={posalji}
          className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
          aria-label="Nova cijena"
        >
          <p className="text-sm font-medium">Nova cijena za odabrane ({odabrani.size})</p>
          <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
            <Polje
              oznaka="€/mj. bez PDV-a"
              name="iznos"
              inputMode="decimal"
              required
              greska={stanje && !stanje.ok ? stanje.polja?.["iznos"] : undefined}
            />
            <Polje oznaka="Od mjeseca" name="odMjeseca" type="month" required defaultValue={prvaNeizdana} />
            <Polje oznaka="Do mjeseca (sezona)" name="doMjeseca" type="month" opis="Prazno = trajno" />
            <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
              Postavi cijenu
            </Gumb>
          </div>
          {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
        </Obrazac>
      )}
    </div>
  );
}

export function DodajUredaje({ ugovorId, od }: { ugovorId: string; od: string }) {
  const [kljuc, setKljuc] = useState(0);
  const [stanje, posalji, uTijeku] = useActionState(async (p: Awaited<ReturnType<typeof dodajUredajeAkcija>> | undefined, fd: FormData) => {
    const r = await dodajUredajeAkcija(ugovorId, p, fd);
    if (r.ok) setKljuc((x) => x + 1);
    return r;
  }, undefined);
  return (
    <Obrazac key={kljuc} akcija={posalji} className="flex flex-col gap-3" aria-label="Dodavanje uređaja na ugovor">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Serijski brojevi (svaki u svom redu ili odvojeni razmakom)</span>
        <textarea name="serijski" rows={3} required className={`${klaseUnosa} font-mono`} />
      </label>
      <div className="grid gap-2 sm:grid-cols-3 sm:items-end">
        <Polje oznaka="Naplata od" name="od" type="date" required defaultValue={od} />
        <Polje
          oznaka="€/mj. bez PDV-a"
          name="cijena"
          inputMode="decimal"
          required
          greska={stanje && !stanje.ok ? stanje.polja?.["cijena"] : undefined}
        />
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">Uređaji su</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="izvor" value="SKLADISTE" defaultChecked /> na skladištu
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="izvor" value="KLIJENT" /> već kod klijenta
          </label>
        </fieldset>
      </div>
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          Dodaj na ugovor
        </Gumb>
      </div>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </Obrazac>
  );
}
