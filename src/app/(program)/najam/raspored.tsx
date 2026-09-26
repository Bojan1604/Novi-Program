"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Obavijest } from "@/components/ui/obavijest";
import { postaviMjesecAkcija } from "./akcije";

export type CelijaRasporeda = { mjesec: string; iznos: string; izvor: "PLAN" | "RUCNO" | "PAUZA" | "FAKTURIRANO" | "NEMA" };
export type RedakRasporeda = { planId: string; uredajId: string; serijski: string; celije: CelijaRasporeda[]; zbroj: string };

const BOJE: Record<CelijaRasporeda["izvor"], string> = {
  PLAN: "",
  RUCNO: "bg-amber-50 dark:bg-amber-950",
  PAUZA: "bg-neutral-100 text-neutral-500 dark:bg-neutral-900",
  FAKTURIRANO: "font-medium",
  NEMA: "text-neutral-300 dark:text-neutral-700",
};

/** Mjeseci × uređaji. Klik na neizdani mjesec: pauza ↔ plan; u načinu „ručni iznos“ upisuje se iznos. */
export function RasporedNajma({
  ugovorId,
  mjeseci,
  redovi,
  smije,
}: {
  ugovorId: string;
  mjeseci: string[];
  redovi: RedakRasporeda[];
  smije: boolean;
}) {
  const [nacin, setNacin] = useState<"PAUZA" | "RUCNO">("PAUZA");
  const [greska, setGreska] = useState<string | null>(null);
  const [uTijeku, zapocni] = useTransition();
  const klik = (r: RedakRasporeda, c: CelijaRasporeda) => {
    if (!smije || c.izvor === "FAKTURIRANO" || c.izvor === "NEMA" || uTijeku) return;
    let vrsta = c.izvor === "PAUZA" ? "PLAN" : "PAUZA";
    let iznos: string | null = null;
    if (nacin === "RUCNO") {
      const upis = window.prompt(
        `${r.serijski}, ${c.mjesec.slice(5)}/${c.mjesec.slice(0, 4)} — iznos (€); prazno = prema planu`,
        c.izvor === "RUCNO" ? c.iznos : "",
      );
      if (upis === null) return;
      vrsta = upis.trim() ? "RUCNO" : "PLAN";
      iznos = upis.trim() || null;
    }
    zapocni(async () => {
      const o = await postaviMjesecAkcija(ugovorId, r.planId, c.mjesec, vrsta, iznos);
      setGreska(o.ok ? null : o.greska);
    });
  };
  return (
    <div className="flex flex-col gap-3">
      {smije && (
        <fieldset className="flex flex-wrap items-center gap-3 text-sm">
          <legend className="sr-only">Način uređivanja</legend>
          <span className="font-medium">Klik na mjesec:</span>
          <label className="flex items-center gap-1">
            <input type="radio" name="nacin" checked={nacin === "PAUZA"} onChange={() => setNacin("PAUZA")} /> pauza / plan
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="nacin" checked={nacin === "RUCNO"} onChange={() => setNacin("RUCNO")} /> ručni iznos
          </label>
          {uTijeku && <span className="text-neutral-500">Spremam…</span>}
        </fieldset>
      )}
      {greska && <Obavijest vrsta="greska">{greska}</Obavijest>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="raspored">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="sticky left-0 bg-white py-1 pr-2 dark:bg-neutral-950">Uređaj</th>
              {mjeseci.map((m) => (
                <th key={m} className="px-1 py-1 text-right whitespace-nowrap">
                  {m.slice(5)}/{m.slice(2, 4)}
                </th>
              ))}
              <th className="px-1 py-1 text-right">Ukupno</th>
            </tr>
          </thead>
          <tbody>
            {redovi.map((r) => (
              <tr key={r.planId} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="sticky left-0 bg-white py-1 pr-2 font-mono whitespace-nowrap dark:bg-neutral-950">
                  <Link href={`/uredaji/${r.uredajId}`} className="text-primarna hover:underline">
                    {r.serijski}
                  </Link>
                </td>
                {r.celije.map((c) => (
                  <td key={c.mjesec} className={`px-1 py-1 text-right whitespace-nowrap ${BOJE[c.izvor]}`}>
                    {smije && c.izvor !== "FAKTURIRANO" && c.izvor !== "NEMA" ? (
                      <button
                        type="button"
                        onClick={() => klik(r, c)}
                        className="w-full text-right hover:underline"
                        aria-label={`${r.serijski} ${c.mjesec}: ${c.izvor === "PAUZA" ? "pauza" : c.iznos}`}
                      >
                        {c.izvor === "PAUZA" ? "pauza" : c.iznos}
                      </button>
                    ) : (
                      <span title={c.izvor === "FAKTURIRANO" ? "izdano" : undefined}>{c.izvor === "NEMA" ? "·" : c.iznos}</span>
                    )}
                  </td>
                ))}
                <td className="px-1 py-1 text-right font-medium">{r.zbroj}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">Podebljano = izdano (iznos s računa, ne mijenja se) · žuto = ručni iznos · sivo = pauza.</p>
    </div>
  );
}
