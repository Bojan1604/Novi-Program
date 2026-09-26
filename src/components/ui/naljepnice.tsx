"use client";

import { useState } from "react";
import { FORMATI, jeFormat, POPIS_FORMATA, type KljucFormata } from "@/domain/naljepnice";
import { Dijalog } from "./dijalog";
import { Gumb } from "./gumb";
import { Obavijest } from "./obavijest";
import { Odabir, Polje } from "./polje";

const SPREMISTE = "naljepnice-format";

/** Gumb „Naljepnice“: odabir formata (pamti se) i početne naljepnice na arku, pa PDF u novoj kartici. */
export function GumbNaljepnice({ parametri, oznaka = "Naljepnice" }: { parametri: Record<string, string | string[] | undefined>; oznaka?: string }) {
  const [otvoren, setOtvoren] = useState(false);
  const [format, setFormat] = useState<KljucFormata>("a4-3x8");
  const [pocetak, setPocetak] = useState("1");
  const f = FORMATI[format];
  const naArku = f.stupci * f.redovi;

  const adresa = () => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(parametri)) for (const x of [v ?? []].flat()) q.append(k, x);
    q.set("format", format);
    if (naArku > 1) q.set("pocetak", String(Math.min(Math.max(Number(pocetak) || 1, 1), naArku)));
    return `/api/naljepnice?${q}`;
  };

  return (
    <>
      <Gumb
        onClick={() => {
          try {
            const z = localStorage.getItem(SPREMISTE);
            if (jeFormat(z)) setFormat(z);
          } catch {
            // bez spremljenog formata
          }
          setOtvoren(true);
        }}
      >
        {oznaka}
      </Gumb>
      <Dijalog otvoren={otvoren} onZatvori={() => setOtvoren(false)} naslov="Ispis naljepnica">
        <div className="flex flex-col gap-3">
          <Odabir
            oznaka="Format"
            value={format}
            onChange={(e) => {
              const v = e.target.value as KljucFormata;
              setFormat(v);
              try {
                localStorage.setItem(SPREMISTE, v);
              } catch {
                // nije bitno
              }
            }}
          >
            {POPIS_FORMATA.map((k) => (
              <option key={k} value={k}>
                {FORMATI[k].naziv}
              </option>
            ))}
          </Odabir>
          {naArku > 1 && (
            <Polje
              oznaka={`Počni od naljepnice (1–${naArku})`}
              inputMode="numeric"
              value={pocetak}
              onChange={(e) => setPocetak(e.target.value)}
              opis="Za djelomično iskorišten arak: prve se preskaču."
            />
          )}
          <Obavijest vrsta="info">
            U prozoru za ispis odaberite <b>stvarnu veličinu (100 %)</b>, ne „prilagodi stranici“
            {naArku === 1 ? ", i veličinu papira jednaku naljepnici." : "."}
          </Obavijest>
          <div className="flex gap-2">
            <a
              href={adresa()}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center rounded-md bg-primarna px-4 py-2 text-sm font-medium text-primarna-tekst"
            >
              Otvori PDF
            </a>
            <Gumb onClick={() => setOtvoren(false)}>Zatvori</Gumb>
          </div>
        </div>
      </Dijalog>
    </>
  );
}
