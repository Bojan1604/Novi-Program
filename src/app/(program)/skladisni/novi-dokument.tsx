"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Odabir, Polje, klaseUnosa } from "@/components/ui/polje";
import { Pretrazivac } from "@/components/ui/pretrazivac";
import type { Stavka } from "@/components/ui/pretrazivac-stanje";
import { GumbiSkenera } from "@/components/ui/skener";
import { procitajDatum } from "@/domain/datum";
import { RAZLOZI_IZLAZA, VRSTE_DOKUMENATA, type VrstaDokumenta } from "@/domain/skladisni-dokumenti";
import { serijskiIzKoda } from "@/domain/skeniranje";
import { STANJA, type Stanje } from "@/domain/stanja-uredaja";
import { procitajSerijske } from "@/domain/zaprimanje";
import { provjeriSkeniraneAkcija } from "../skeniranje/akcije";
import { izdajDokumentAkcija } from "./akcije";

type Info = { model: string; stanje: string; lokacija: string } | null;
type Skladiste = { id: string; naziv: string; aktivan: boolean; zadano: boolean };

export function NoviDokument({ vrsta, danas, skladista }: { vrsta: VrstaDokumenta; danas: string; skladista: Skladiste[] }) {
  const aktivna = skladista.filter((s) => s.aktivan);
  const zadano = aktivna.find((s) => s.zadano)?.id ?? aktivna[0]?.id ?? "";
  const [iz, setIz] = useState(zadano);
  const [u, setU] = useState(vrsta === "MEDJUSKLADISNICA" ? (aktivna.find((s) => s.id !== zadano)?.id ?? "") : zadano);
  const [partner, setPartner] = useState<Stavka | null>(null);
  const [razlog, setRazlog] = useState("");
  const [datum, setDatum] = useState(danas.split("-").reverse().join(".") + ".");
  const [napomena, setNapomena] = useState("");
  const [popis, setPopis] = useState<string[]>([]);
  const [info, setInfo] = useState<Record<string, Info>>({});
  const [zalijepi, setZalijepi] = useState("");
  const [greske, setGreske] = useState<string[]>([]);
  const unos = useRef<HTMLInputElement>(null);

  const dodaj = async (serijski: string[]) => {
    const novi = serijski.filter((s, i) => serijski.indexOf(s) === i);
    setPopis((p) => [...p, ...novi.filter((s) => !p.includes(s))]);
    const r = await provjeriSkeniraneAkcija(novi);
    if (!r.ok) return;
    const m = new Map(r.podaci.map((x) => [x.serijski, x]));
    setInfo((st) => ({
      ...st,
      ...Object.fromEntries(
        novi.map((s) => [s, m.has(s) ? { model: m.get(s)!.model, stanje: m.get(s)!.stanje, lokacija: m.get(s)!.lokacija } : null]),
      ),
    }));
  };

  const [stanje, posalji, uTijeku] = useActionState(izdajDokumentAkcija, undefined);
  const nema = popis.filter((s) => info[s] === null);

  const izdaj = () => {
    const d = procitajDatum(datum);
    if (!d.ok) {
      setGreske(["Datum nije ispravan (npr. 25.09.2026.)."]);
      return;
    }
    setGreske([]);
    const fd = new FormData();
    fd.set(
      "podaci",
      JSON.stringify({
        vrsta,
        datum: d.vrijednost,
        skladisteIzId: vrsta === "POVRAT" ? null : iz || null,
        skladisteUId: vrsta === "IZLAZ" ? null : u || null,
        partnerId: partner?.id ?? null,
        razlog: vrsta === "IZLAZ" ? razlog || null : null,
        napomena: napomena || null,
        serijski: popis,
      }),
    );
    startTransition(() => posalji(fd));
  };

  const opcije = (lista: Skladiste[]) =>
    lista.map((s) => (
      <option key={s.id} value={s.id}>
        {s.naziv}
      </option>
    ));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Polje oznaka="Datum" value={datum} onChange={(e) => setDatum(e.target.value)} />
        {vrsta !== "POVRAT" && (
          <Odabir oznaka={vrsta === "IZLAZ" ? "Iz skladišta" : "Iz skladišta"} value={iz} onChange={(e) => setIz(e.target.value)}>
            {opcije(skladista)}
          </Odabir>
        )}
        {vrsta !== "IZLAZ" && (
          <Odabir oznaka={vrsta === "POVRAT" ? "Vraća se na skladište" : "U skladište"} value={u} onChange={(e) => setU(e.target.value)}>
            <option value="">Odaberite…</option>
            {opcije(aktivna)}
          </Odabir>
        )}
        {vrsta === "IZLAZ" && (
          <Odabir oznaka="Razlog izlaza" value={razlog} onChange={(e) => setRazlog(e.target.value)}>
            <option value="">Odaberite…</option>
            {RAZLOZI_IZLAZA.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Odabir>
        )}
        {vrsta !== "MEDJUSKLADISNICA" && (
          <Pretrazivac
            izvor="/api/odabir/partneri"
            oznaka={vrsta === "POVRAT" ? "Od koga se vraća (neobavezno)" : "Kome ide (neobavezno)"}
            onPromjena={setPartner}
          />
        )}
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <span className="text-sm font-medium">Napomena</span>
          <textarea className={klaseUnosa} rows={2} value={napomena} onChange={(e) => setNapomena(e.target.value)} maxLength={2000} />
        </label>
      </div>
      {vrsta === "IZLAZ" && (
        <Obavijest vrsta="info">Izlaz mora odobriti drugi korisnik (voditelj ili administrator) — tek tada uređaji izlaze sa skladišta.</Obavijest>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Serijski broj (skener ili upis, Enter)</span>
            <input
              ref={unos}
              className={`${klaseUnosa} font-mono`}
              autoComplete="off"
              aria-label="Serijski broj"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const s = serijskiIzKoda(e.currentTarget.value);
                if (s) {
                  void dodaj([s]);
                  e.currentTarget.value = "";
                  setGreske([]);
                } else if (e.currentTarget.value.trim()) setGreske([`„${e.currentTarget.value.trim()}“ nije ispravan serijski broj.`]);
              }}
            />
          </label>
          <GumbiSkenera skupno onSerijski={(s) => void dodaj([s])} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Ili zalijepite stupac serijskih brojeva</span>
            <textarea className={klaseUnosa} rows={3} value={zalijepi} onChange={(e) => setZalijepi(e.target.value)} />
          </label>
          <div>
            <Gumb
              malen
              onClick={() => {
                const r = procitajSerijske(zalijepi);
                setGreske(r.filter((x) => x.greska && !x.serijski).map((x) => `Redak ${x.red}: ${x.greska}`));
                void dodaj(r.filter((x) => x.serijski).map((x) => x.serijski!));
                setZalijepi("");
              }}
            >
              Dodaj zalijepljene
            </Gumb>
          </div>
        </div>
      </div>

      {greske.length > 0 && <Obavijest vrsta="greska">{greske.slice(0, 10).join(" ")}</Obavijest>}
      {nema.length > 0 && <Obavijest vrsta="upozorenje">Nisu u programu: {nema.join(", ")}. Uklonite ih s popisa.</Obavijest>}

      <div>
        <div className="mb-2 text-sm font-medium">Uređaji ({popis.length})</div>
        {popis.length > 0 && (
          <ul className="flex max-h-96 flex-col divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-900" data-testid="uredaji-dokumenta">
            {popis.map((s) => {
              const x = info[s];
              return (
                <li
                  key={s}
                  className={`flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm ${x === null ? "bg-red-50 dark:bg-red-950" : ""}`}
                >
                  <div className="min-w-0">
                    <span className="font-mono">{s}</span>
                    <span className="ml-2 text-xs text-neutral-600 dark:text-neutral-400">
                      {x === undefined
                        ? "…"
                        : x === null
                          ? "nije u programu"
                          : `${x.model} · ${STANJA[x.stanje as Stanje]}${x.lokacija ? ` · ${x.lokacija}` : ""}`}
                    </span>
                  </div>
                  <Gumb malen varijanta="tihi" aria-label={`Ukloni ${s}`} onClick={() => setPopis((p) => p.filter((y) => y !== s))}>
                    Ukloni
                  </Gumb>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {stanje && !stanje.ok && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
      <div>
        <Gumb varijanta="primarni" onClick={izdaj} disabled={uTijeku || popis.length === 0 || nema.length > 0}>
          {vrsta === "IZLAZ" ? "Pošalji na odobrenje" : `Izdaj ${VRSTE_DOKUMENATA[vrsta].naziv.toLowerCase()}`}
        </Gumb>
      </div>
    </div>
  );
}
