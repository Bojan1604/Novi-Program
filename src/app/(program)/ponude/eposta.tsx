"use client";

import { useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { klaseUnosa, Odabir, Polje } from "@/components/ui/polje";
import { mailto, procitajPrimatelje, VRSTE_PORUKA, type VrstaPoruke } from "@/domain/eposta";
import { posaljiEpostomAkcija, zabiljeziMailtoAkcija } from "./akcije-eposta";

export function SlanjeEposte({
  dokumentId,
  prima: pocetniPrima,
  vrsta: pocetnaVrsta,
  predlosci,
  smtp,
}: {
  dokumentId: string;
  prima: string;
  vrsta: VrstaPoruke;
  predlosci: Partial<Record<VrstaPoruke, { predmet: string; tijelo: string }>>;
  smtp: boolean;
}) {
  const [vrsta, setVrsta] = useState<VrstaPoruke>(pocetnaVrsta);
  const [prima, setPrima] = useState(pocetniPrima);
  const [predmet, setPredmet] = useState(predlosci[pocetnaVrsta]?.predmet ?? "");
  const [tijelo, setTijelo] = useState(predlosci[pocetnaVrsta]?.tijelo ?? "");
  const [poruka, setPoruka] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [uTijeku, zapocni] = useTransition();
  const podaci = { vrsta, prima, predmet, tijelo };

  return (
    <div className="flex flex-col gap-3" aria-label="Slanje e-poštom" role="group">
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka="Prima" value={prima} onChange={(e) => setPrima(e.target.value)} placeholder="kupac@firma.hr (više: odvojite zarezom)" />
        <Odabir
          oznaka="Predložak"
          value={vrsta}
          onChange={(e) => {
            const v = e.target.value as VrstaPoruke;
            setVrsta(v);
            setPredmet(predlosci[v]?.predmet ?? "");
            setTijelo(predlosci[v]?.tijelo ?? "");
          }}
        >
          {(Object.keys(predlosci) as VrstaPoruke[]).map((v) => (
            <option key={v} value={v}>
              {VRSTE_PORUKA[v]}
            </option>
          ))}
        </Odabir>
        <div className="sm:col-span-2">
          <Polje oznaka="Predmet" value={predmet} onChange={(e) => setPredmet(e.target.value)} />
        </div>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">Poruka</span>
          <textarea className={klaseUnosa} rows={7} value={tijelo} onChange={(e) => setTijelo(e.target.value)} />
        </label>
      </div>
      {poruka && <Obavijest vrsta={poruka.ok ? "uspjeh" : "greska"}>{poruka.tekst}</Obavijest>}
      <div className="flex flex-wrap items-center gap-2">
        {smtp && (
          <Gumb
            varijanta="primarni"
            disabled={uTijeku}
            onClick={() =>
              zapocni(async () => {
                const r = await posaljiEpostomAkcija(dokumentId, podaci);
                setPoruka(r.ok ? { ok: true, tekst: r.poruka } : { ok: false, tekst: r.greska });
              })
            }
          >
            Pošalji s PDF-om
          </Gumb>
        )}
        <Gumb
          varijanta={smtp ? "sekundarni" : "primarni"}
          disabled={uTijeku}
          onClick={() => {
            const p = procitajPrimatelje(prima);
            if (!p.ok) return setPoruka({ ok: false, tekst: p.greska });
            window.location.href = mailto(p.vrijednost, predmet, tijelo);
            zapocni(async () => {
              await zabiljeziMailtoAkcija(dokumentId, podaci);
              setPoruka({ ok: true, tekst: "Poruka je otvorena u programu za poštu — priložite PDF (gumb „PDF“ gore)." });
            });
          }}
        >
          Otvori u programu za poštu
        </Gumb>
        {!smtp && <span className="text-xs text-neutral-500">Za slanje iz programa postavite poslužitelj pošte u Postavkama firme.</span>}
      </div>
    </div>
  );
}
