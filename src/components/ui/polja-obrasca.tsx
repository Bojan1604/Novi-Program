"use client";

import { formatirajIznos } from "@/domain/novac";
import type { Polje, Vrijednost } from "@/domain/polja";
import { Kvacica, Odabir, Polje as PoljeUnosa } from "./polje";
import { klaseUnosa } from "./polje";

/** Početni tekst u polju za vrijednost iz baze. */
export function tekstZaUnos(p: Polje, v: Vrijednost | undefined): string {
  if (v === null || v === undefined) return "";
  if (p.vrsta === "iznos" || p.vrsta === "postotak") return formatirajIznos(Number(v));
  if (p.vrsta === "datum") return String(v).split("-").reverse().join(".") + ".";
  return String(v);
}

/** Polja obrasca iz opisa (šifrarnici i slični obrasci). */
export function PoljaObrasca({
  polja,
  vrijednosti,
  greske,
  opcije,
}: {
  polja: Polje[];
  vrijednosti: Record<string, Vrijednost>;
  greske?: Record<string, string>;
  opcije: Record<string, { vrijednost: string; naziv: string }[]>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {polja.map((p) => {
        const g = greske?.[p.ime];
        const v = vrijednosti[p.ime];
        if (p.vrsta === "kvacica")
          return <Kvacica key={p.ime} name={p.ime} oznaka={p.oznaka} defaultChecked={v === true} className="sm:col-span-2" />;
        if (p.vrsta === "odabir")
          return (
            <Odabir
              key={p.ime}
              oznaka={p.oznaka}
              name={p.ime}
              defaultValue={typeof v === "string" ? v : ""}
              greska={g}
              opis={p.opis}
              required={p.obavezno}
            >
              <option value="">{p.obavezno ? "Odaberite…" : "—"}</option>
              {(opcije[p.ime] ?? []).map((o) => (
                <option key={o.vrijednost} value={o.vrijednost}>
                  {o.naziv}
                </option>
              ))}
            </Odabir>
          );
        if (p.vrsta === "dugiTekst")
          return (
            <label key={p.ime} className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">{p.oznaka}</span>
              <textarea name={p.ime} defaultValue={tekstZaUnos(p, v)} rows={3} className={klaseUnosa} aria-invalid={g ? true : undefined} />
              {g && <span className="text-sm text-red-700 dark:text-red-400">{g}</span>}
            </label>
          );
        const brojcano = p.vrsta === "iznos" || p.vrsta === "postotak" || p.vrsta === "cijeli";
        return (
          <PoljeUnosa
            key={p.ime}
            oznaka={p.oznaka}
            name={p.ime}
            defaultValue={tekstZaUnos(p, v)}
            greska={g}
            opis={p.opis}
            required={p.obavezno}
            inputMode={brojcano ? "decimal" : p.vrsta === "email" ? "email" : undefined}
            autoComplete="off"
            className={brojcano ? "" : ""}
          />
        );
      })}
    </div>
  );
}
