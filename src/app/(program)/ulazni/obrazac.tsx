"use client";

import { useActionState, useState, useTransition } from "react";
import type { Odgovor } from "@/lib/greske";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa, Kvacica, Odabir, Polje } from "@/components/ui/polje";
import { Pretrazivac } from "@/components/ui/pretrazivac";
import { demoPrimjerAkcija, odbijAkcija, platiAkcija, preuzmiERacuneAkcija, prihvatiAkcija, spremiUlazniAkcija, stornoUlaznogAkcija } from "./akcije";

export type PocetniUlazni = {
  id: string | null;
  verzija: number;
  eRacun: boolean;
  broj: string;
  datum: string;
  dospijece: string;
  dobavljac: { id: string; naziv: string } | null;
  dobavljacTekst: string;
  dobavljacOib: string;
  narudzbenica: { id: string; broj: string } | null;
  primke: { id: string; broj: string }[];
  primkaId: string | null;
  zaRobu: boolean;
  osnovica: string;
  pdv: string;
  opis: string;
};

export function ObrazacUlaznog({ p, smije }: { p: PocetniUlazni; smije: boolean }) {
  const [stanje, posalji, uTijeku] = useActionState(spremiUlazniAkcija.bind(null, p.id), undefined);
  const g = (x: string) => (stanje && !stanje.ok ? stanje.polja?.[x] : undefined);
  const zakljucano = p.eRacun; // eRačun: iznosi i dobavljač su s računa
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-4" aria-label="Ulazni račun">
      <input type="hidden" name="verzija" value={p.verzija} />
      {p.narudzbenica && <input type="hidden" name="narudzbenicaId" value={p.narudzbenica.id} />}
      <fieldset disabled={!smije || uTijeku} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Polje oznaka="Broj računa dobavljača" name="broj" required defaultValue={p.broj} readOnly={zakljucano} greska={g("broj")} />
        <div className="grid grid-cols-2 gap-2">
          <Polje oznaka="Datum" name="datum" type="date" required defaultValue={p.datum} readOnly={zakljucano} greska={g("datum")} />
          <Polje oznaka="Dospijeće" name="dospijece" type="date" defaultValue={p.dospijece} greska={g("dospijece")} />
        </div>
        {zakljucano ? (
          <p className="text-sm">
            Dobavljač: {p.dobavljac?.naziv ?? p.dobavljacTekst} {p.dobavljacOib && `(OIB ${p.dobavljacOib})`}
          </p>
        ) : (
          <>
            <Pretrazivac
              izvor="/api/odabir/partneri?vrsta=dobavljac"
              oznaka="Dobavljač iz šifrarnika"
              name="dobavljacId"
              pocetna={p.dobavljac}
              greska={g("dobavljac")}
            />
            <div className="grid grid-cols-[1fr_9rem] gap-2">
              <Polje oznaka="…ili naziv dobavljača" name="dobavljacTekst" defaultValue={p.dobavljacTekst} />
              <Polje oznaka="OIB" name="dobavljacOib" inputMode="numeric" defaultValue={p.dobavljacOib} greska={g("dobavljacOib")} />
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Polje
            oznaka="Osnovica (€)"
            name="osnovica"
            inputMode="decimal"
            required
            defaultValue={p.osnovica}
            readOnly={zakljucano}
            greska={g("osnovica")}
          />
          <Polje oznaka="PDV (€)" name="pdv" inputMode="decimal" defaultValue={p.pdv} readOnly={zakljucano} greska={g("pdv")} />
        </div>
        {p.narudzbenica ? (
          <div className="flex flex-col gap-2 text-sm">
            <span>Narudžbenica: {p.narudzbenica.broj}</span>
            {p.primke.length > 0 && (
              <Odabir oznaka="Primka" name="primkaId" defaultValue={p.primkaId ?? ""}>
                <option value="">—</option>
                {p.primke.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.broj}
                  </option>
                ))}
              </Odabir>
            )}
          </div>
        ) : (
          <div />
        )}
        <Kvacica name="zaRobu" oznaka="Račun za robu (ulazi u trošak robe narudžbenice; inače prijevoz/usluga)" defaultChecked={p.zaRobu} />
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">Opis</span>
          <textarea name="opis" rows={2} defaultValue={p.opis} className={klaseUnosa} />
        </label>
      </fieldset>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      {smije && (
        <div>
          <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
            Spremi
          </Gumb>
        </div>
      )}
    </Obrazac>
  );
}

export function StornoUlaznog({ id }: { id: string }) {
  const [stanje, posalji, uTijeku] = useActionState(stornoUlaznogAkcija.bind(null, id), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-2" aria-label="Storno ulaznog računa">
      <div className="flex flex-wrap items-end gap-2">
        <Polje oznaka="Razlog storna" name="razlog" required />
        <Gumb type="submit" varijanta="opasni" disabled={uTijeku}>
          Storniraj
        </Gumb>
      </div>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </Obrazac>
  );
}

export function PreuzimanjeERacuna({ demo }: { demo: boolean }) {
  const [stanje, setStanje] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Gumb disabled={uTijeku} onClick={() => zapocni(async () => setStanje(await preuzmiERacuneAkcija()))}>
          Preuzmi eRačune
        </Gumb>
        {demo && (
          <Gumb varijanta="tihi" disabled={uTijeku} onClick={() => zapocni(async () => setStanje(await demoPrimjerAkcija()))}>
            Demo: primjer eRačuna
          </Gumb>
        )}
      </div>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </div>
  );
}

export function ObradaERacuna({
  id,
  narudzbenice,
}: {
  id: string;
  narudzbenice: { id: string; broj: string; primke: { id: string; broj: string }[] }[];
}) {
  const [prihvat, posaljiPrihvat, uPrihvatu] = useActionState(prihvatiAkcija.bind(null, id), undefined);
  const [odbij, posaljiOdbij, uOdbijanju] = useActionState(odbijAkcija.bind(null, id), undefined);
  const [nar, setNar] = useState("");
  const primke = narudzbenice.find((n) => n.id === nar)?.primke ?? [];
  return (
    <div className="flex flex-col gap-5">
      <Obrazac akcija={posaljiPrihvat} className="flex flex-col gap-3" aria-label="Prihvat eRačuna">
        <div className="grid gap-2 sm:grid-cols-2">
          <Odabir oznaka="Narudžbenica" name="narudzbenicaId" value={nar} onChange={(e) => setNar(e.target.value)}>
            <option value="">—</option>
            {narudzbenice.map((n) => (
              <option key={n.id} value={n.id}>
                {n.broj}
              </option>
            ))}
          </Odabir>
          {primke.length > 0 ? (
            <Odabir oznaka="Primka" name="primkaId" defaultValue="">
              <option value="">—</option>
              {primke.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.broj}
                </option>
              ))}
            </Odabir>
          ) : (
            <div />
          )}
        </div>
        <Kvacica name="zaRobu" oznaka="Račun za robu (knjiži se samo razlika iznad primke)" defaultChecked />
        <div>
          <Gumb type="submit" varijanta="primarni" disabled={uPrihvatu}>
            Prihvati
          </Gumb>
        </div>
        {prihvat && (prihvat.ok ? <Obavijest vrsta="uspjeh">{prihvat.poruka}</Obavijest> : <Obavijest vrsta="greska">{prihvat.greska}</Obavijest>)}
      </Obrazac>
      <Obrazac
        akcija={posaljiOdbij}
        className="flex flex-col gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800"
        aria-label="Odbijanje eRačuna"
      >
        <div className="flex flex-wrap items-end gap-2">
          <Polje oznaka="Razlog odbijanja" name="razlog" required className="min-w-64 flex-1" />
          <Gumb type="submit" varijanta="opasni" disabled={uOdbijanju}>
            Odbij
          </Gumb>
        </div>
        {odbij && (odbij.ok ? <Obavijest vrsta="uspjeh">{odbij.poruka}</Obavijest> : <Obavijest vrsta="greska">{odbij.greska}</Obavijest>)}
      </Obrazac>
    </div>
  );
}

export function PlacanjeUlaznog({ id, otvoreno, danas }: { id: string; otvoreno: string; danas: string }) {
  const [stanje, posalji, uTijeku] = useActionState(platiAkcija.bind(null, id), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-2" aria-label="Plaćanje ulaznog računa">
      <div className="flex flex-wrap items-end gap-2">
        <Polje oznaka="Datum" name="datum" type="date" required defaultValue={danas} />
        <Polje oznaka="Iznos (€)" name="iznos" inputMode="decimal" required defaultValue={otvoreno} />
        <Gumb type="submit" disabled={uTijeku}>
          Upiši plaćanje
        </Gumb>
      </div>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </Obrazac>
  );
}
