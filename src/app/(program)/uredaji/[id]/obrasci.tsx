"use client";

import { useActionState, useRef, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { tekstZaUnos } from "@/components/ui/polja-obrasca";
import { klaseUnosa, Odabir, Polje } from "@/components/ui/polje";
import { Pretrazivac } from "@/components/ui/pretrazivac";
import type { PoljeIspravka } from "@/domain/kartica-uredaja";
import { NAJVECI_PRILOG } from "@/domain/prilozi";
import { dodajPrilogeAkcija, ispraviUredajAkcija, obrisiPrilogAkcija, obrisiUredajAkcija } from "./akcije";

export type PocetniUredaj = {
  verzija: number;
  serijski: string;
  model: { id: string; naziv: string };
  stanjeRobeId: string;
  jamstvoDo: string | null;
  /** centi */
  nabavnaCijena: number | null;
  cpu: string;
  ram: string;
  disk: string;
  ekran: string;
  os: string;
  napomena: string;
};

export function ObrazacUredaja({
  id,
  pocetno,
  dopusteno,
  zakljucano,
  stanjaRobe,
}: {
  id: string;
  pocetno: PocetniUredaj;
  dopusteno: PoljeIspravka[];
  zakljucano: string | null;
  stanjaRobe: { id: string; naziv: string; aktivan: boolean }[];
}) {
  const [stanje, posalji, uTijeku] = useActionState(ispraviUredajAkcija.bind(null, id), undefined);
  const smije = (p: PoljeIspravka) => dopusteno.includes(p);
  const g = (p: string) => (stanje && !stanje.ok ? stanje.polja?.[p] : undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-4" aria-label="Ispravak uređaja">
      {/* verzija se osvježava nakon spremanja (nova vrijednost sa stranice) */}
      <input type="hidden" name="verzija" value={pocetno.verzija} />
      <fieldset disabled={uTijeku} className="flex min-w-0 flex-col gap-4">
        {zakljucano && <Obavijest vrsta="info">{zakljucano}</Obavijest>}
        <div className="grid gap-3 sm:grid-cols-2">
          {smije("serijski") && (
            <Polje
              oznaka="Serijski broj"
              name="serijski"
              defaultValue={pocetno.serijski}
              greska={g("serijski")}
              autoCapitalize="characters"
              required
            />
          )}
          {smije("modelId") && (
            <Pretrazivac izvor="/api/odabir/modeli" name="modelId" oznaka="Model" pocetna={pocetno.model} greska={g("modelId")} obavezno />
          )}
          <Odabir oznaka="Stanje robe" name="stanjeRobeId" defaultValue={pocetno.stanjeRobeId} greska={g("stanjeRobeId")}>
            <option value="">—</option>
            {stanjaRobe
              .filter((s) => s.aktivan || s.id === pocetno.stanjeRobeId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.naziv}
                </option>
              ))}
          </Odabir>
          <Polje
            oznaka="Jamstvo do"
            name="jamstvoDo"
            defaultValue={pocetno.jamstvoDo ? tekstZaUnos({ ime: "", oznaka: "", vrsta: "datum" }, pocetno.jamstvoDo) : ""}
            placeholder="npr. 31.12.2028."
            greska={g("jamstvoDo")}
          />
          {smije("nabavnaCijena") && (
            <Polje
              oznaka="Nabavna cijena (€, bez PDV-a)"
              name="nabavnaCijena"
              inputMode="decimal"
              defaultValue={pocetno.nabavnaCijena === null ? "" : tekstZaUnos({ ime: "", oznaka: "", vrsta: "iznos" }, pocetno.nabavnaCijena)}
              greska={g("nabavnaCijena")}
            />
          )}
          <Polje oznaka="Procesor" name="cpu" defaultValue={pocetno.cpu} greska={g("cpu")} />
          <Polje oznaka="RAM" name="ram" defaultValue={pocetno.ram} greska={g("ram")} />
          <Polje oznaka="Disk" name="disk" defaultValue={pocetno.disk} greska={g("disk")} />
          <Polje oznaka="Ekran" name="ekran" defaultValue={pocetno.ekran} greska={g("ekran")} />
          <Polje oznaka="Operacijski sustav" name="os" defaultValue={pocetno.os} greska={g("os")} />
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium">Napomena</span>
            <textarea name="napomena" defaultValue={pocetno.napomena} rows={3} maxLength={2000} className={klaseUnosa} />
            {g("napomena") && <span className="text-sm text-red-700 dark:text-red-400">{g("napomena")}</span>}
          </label>
        </div>
        {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
        <div>
          <Gumb type="submit" varijanta="primarni">
            Spremi ispravak
          </Gumb>
        </div>
      </fieldset>
    </Obrazac>
  );
}

export function DodajPriloge({ id }: { id: string }) {
  const [kljuc, setKljuc] = useState(0);
  const [prevelike, setPrevelike] = useState<string | null>(null);
  const unos = useRef<HTMLInputElement>(null);
  const [stanje, posalji, uTijeku] = useActionState(async (p: Awaited<ReturnType<typeof dodajPrilogeAkcija>> | undefined, fd: FormData) => {
    const r = await dodajPrilogeAkcija(id, p, fd);
    if (r.ok) setKljuc((x) => x + 1);
    return r;
  }, undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-2" key={kljuc} aria-label="Dodavanje priloga">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Datoteke (PDF, slike, Office… do 10 MB)</span>
          <input
            ref={unos}
            type="file"
            name="datoteke"
            multiple
            required
            className={klaseUnosa}
            onChange={(e) => {
              const vel = [...(e.currentTarget.files ?? [])].filter((f) => f.size > NAJVECI_PRILOG).map((f) => f.name);
              setPrevelike(vel.length ? `Veće od 10 MB: ${vel.join(", ")}` : null);
            }}
          />
        </label>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku || !!prevelike}>
          {uTijeku ? "Šaljem…" : "Dodaj"}
        </Gumb>
      </div>
      {prevelike && <Obavijest vrsta="greska">{prevelike}</Obavijest>}
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </Obrazac>
  );
}

export function ObrisiPrilog({ uredajId, prilogId, naziv }: { uredajId: string; prilogId: string; naziv: string }) {
  const [stanje, posalji, uTijeku] = useActionState(() => obrisiPrilogAkcija(uredajId, prilogId), undefined);
  return (
    <form
      action={posalji}
      onSubmit={(e) => {
        if (!confirm(`Obrisati prilog „${naziv}“?`)) e.preventDefault();
      }}
      className="inline-flex items-center gap-2"
    >
      {stanje && !stanje.ok && <span className="text-sm text-red-700 dark:text-red-400">{stanje.greska}</span>}
      <Gumb type="submit" malen varijanta="tihi" disabled={uTijeku} aria-label={`Obriši prilog ${naziv}`}>
        Obriši
      </Gumb>
    </form>
  );
}

export function ObrisiUredaj({ id, serijski }: { id: string; serijski: string }) {
  const [stanje, posalji, uTijeku] = useActionState(() => obrisiUredajAkcija(id), undefined);
  return (
    <form
      action={posalji}
      onSubmit={(e) => {
        if (!confirm(`Obrisati uređaj ${serijski}? Briše se i njegova povijest i prilozi.`)) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      {stanje && !stanje.ok && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
      <div>
        <Gumb type="submit" varijanta="opasni" disabled={uTijeku}>
          Obriši uređaj
        </Gumb>
      </div>
    </form>
  );
}
