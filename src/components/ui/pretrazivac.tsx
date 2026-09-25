"use client";

import { useEffect, useId, useReducer, useRef } from "react";
import { klaseUnosa } from "./polje";
import { pocetno, pretrazivac, svjezi, type Stavka } from "./pretrazivac-stanje";

/**
 * Odabir s pretragom (partner, model, uređaj…). Pretražuje `izvor` (API koji vraća [{ id, naziv, opis? }]).
 * Bez kvačica; strelice + Enter ili klik; Esc zatvara popis, a tek drugi Esc dijalog.
 * Kasni odgovori se odbacuju, Enter nikad ne bira iz zastarjelih rezultata.
 */
export function Pretrazivac({
  izvor,
  name,
  oznaka,
  pocetna,
  placeholder = "Počnite tipkati…",
  onPromjena,
  greska,
  obavezno,
}: {
  izvor: string;
  name?: string;
  oznaka: string;
  pocetna?: Stavka | null;
  placeholder?: string;
  onPromjena?: (s: Stavka | null) => void;
  greska?: string;
  obavezno?: boolean;
}) {
  const [s, posalji] = useReducer(pretrazivac, pocetna ?? null, pocetno);
  const id = useId();
  const unos = useRef<HTMLInputElement>(null);

  // dohvat rezultata za trenutni upit (s kratkom stankom; prethodni zahtjev se prekida)
  const trebaDohvat = s.otvoren && !svjezi(s);
  const upitZaDohvat = s.upit;
  useEffect(() => {
    if (!trebaDohvat) return;
    const upit = upitZaDohvat;
    const prekid = new AbortController();
    const t = setTimeout(async () => {
      try {
        const odg = await fetch(`${izvor}${izvor.includes("?") ? "&" : "?"}q=${encodeURIComponent(upit)}`, { signal: prekid.signal });
        if (!odg.ok) throw new Error(String(odg.status));
        const stavke = (await odg.json()) as Stavka[];
        posalji({ tip: "rezultati", za: upit, stavke });
      } catch (e) {
        if ((e as Error).name !== "AbortError") posalji({ tip: "rezultati", za: upit, stavke: [] });
      }
    }, 150);
    return () => {
      clearTimeout(t);
      prekid.abort();
    };
  }, [trebaDohvat, upitZaDohvat, izvor]);

  // promjena odabira javlja se roditelju (ne i početna vrijednost)
  const prvi = useRef(true);
  const javi = useRef(onPromjena);
  useEffect(() => {
    javi.current = onPromjena;
  });
  useEffect(() => {
    if (prvi.current) {
      prvi.current = false;
      return;
    }
    javi.current?.(s.odabrano);
  }, [s.odabrano]);

  const tipka = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        posalji({ tip: "dolje" });
        break;
      case "ArrowUp":
        e.preventDefault();
        posalji({ tip: "gore" });
        break;
      case "Enter":
        // nikad ne šalji obrazac Enterom iz pretraživača
        e.preventDefault();
        posalji({ tip: "enter" });
        break;
      case "Escape":
        if (s.otvoren) {
          // zatvori samo popis, ne i dijalog oko njega
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          posalji({ tip: "esc" });
        }
        break;
    }
  };

  const svjeziRezultati = svjezi(s);
  const prikaz = s.otvoren && s.upit.trim() !== "";

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {oznaka}
      </label>
      <div className="relative">
        <input
          ref={unos}
          id={id}
          role="combobox"
          aria-expanded={prikaz}
          aria-controls={`${id}-popis`}
          aria-autocomplete="list"
          aria-activedescendant={prikaz && svjeziRezultati && s.rezultati[s.istaknut] ? `${id}-${s.istaknut}` : undefined}
          aria-invalid={greska ? true : undefined}
          autoComplete="off"
          value={s.upit}
          placeholder={placeholder}
          required={obavezno && !s.odabrano}
          onChange={(e) => posalji({ tip: "tipkanje", upit: e.target.value })}
          onKeyDown={tipka}
          onBlur={() => setTimeout(() => posalji({ tip: "zatvori" }), 150)}
          onFocus={() => s.upit && posalji({ tip: "otvori" })}
          className={`${klaseUnosa} pr-8`}
        />
        {s.upit && (
          <button
            type="button"
            aria-label="Očisti"
            onClick={() => {
              posalji({ tip: "ocisti" });
              unos.current?.focus();
            }}
            className="absolute inset-y-0 right-0 px-2 text-neutral-400 hover:text-neutral-700"
          >
            ×
          </button>
        )}
      </div>
      {name && <input type="hidden" name={name} value={s.odabrano?.id ?? ""} />}
      {greska && <p className="text-sm text-red-700 dark:text-red-400">{greska}</p>}
      {prikaz && (
        <ul
          id={`${id}-popis`}
          role="listbox"
          aria-label={oznaka}
          className="absolute top-full z-40 mt-1 max-h-72 w-full overflow-auto rounded-md border border-neutral-200 bg-pozadina py-1 shadow-lg dark:border-neutral-800"
        >
          {!svjeziRezultati && <li className="px-3 py-2 text-sm text-neutral-500">Tražim…</li>}
          {svjeziRezultati && s.rezultati.length === 0 && <li className="px-3 py-2 text-sm text-neutral-500">Nema rezultata.</li>}
          {svjeziRezultati &&
            s.rezultati.map((st, i) => (
              <li
                key={st.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === s.istaknut}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => posalji({ tip: "klik", stavka: st })}
                className={`cursor-pointer px-3 py-2 text-sm ${i === s.istaknut ? "bg-primarna/10" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
              >
                <div>{st.naziv}</div>
                {st.opis && <div className="text-xs text-neutral-500">{st.opis}</div>}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
