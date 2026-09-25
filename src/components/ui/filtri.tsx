"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { urlPopisa } from "@/domain/popis";
import { klaseUnosa } from "./polje";

function trenutniParametri(sp: URLSearchParams): Record<string, string[]> {
  const o: Record<string, string[]> = {};
  for (const [k, v] of sp) (o[k] ??= []).push(v);
  return o;
}

/** Pretraga popisa: mijenja ?trazi= nakon kratke stanke u tipkanju (stranica se vraća na 1). */
export function PoljePretrage({ placeholder = "Traži…", parametar = "trazi" }: { placeholder?: string; parametar?: string }) {
  const router = useRouter();
  const putanja = usePathname();
  const sp = useSearchParams();
  const [vrijednost, setVrijednost] = useState(sp.get(parametar) ?? "");
  const [, zapocni] = useTransition();
  const zadnje = useRef(sp.get(parametar) ?? "");

  useEffect(() => {
    if (vrijednost.trim() === zadnje.current.trim()) return;
    const t = setTimeout(() => {
      zadnje.current = vrijednost;
      zapocni(() => router.replace(urlPopisa(putanja, trenutniParametri(sp), { [parametar]: vrijednost.trim() || null }), { scroll: false }));
    }, 300);
    return () => clearTimeout(t);
  }, [vrijednost, parametar, putanja, router, sp]);

  return (
    <input
      type="search"
      role="searchbox"
      aria-label={placeholder}
      value={vrijednost}
      onChange={(e) => setVrijednost(e.target.value)}
      placeholder={placeholder}
      className={`${klaseUnosa} sm:max-w-xs`}
    />
  );
}

/** Filtar s više vrijednosti (npr. više statusa odjednom): ?status=a&status=b. */
export function FilterVise({ oznaka, parametar, opcije }: { oznaka: string; parametar: string; opcije: { vrijednost: string; naziv: string }[] }) {
  const router = useRouter();
  const putanja = usePathname();
  const sp = useSearchParams();
  const odabrano = sp.getAll(parametar).flatMap((x) => x.split(","));
  const [otvoren, setOtvoren] = useState(false);
  const id = useId();
  const okvir = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!otvoren) return;
    const klik = (e: MouseEvent) => okvir.current && !okvir.current.contains(e.target as Node) && setOtvoren(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOtvoren(false);
      }
    };
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", esc, true);
    };
  }, [otvoren]);

  const postavi = (vrijednosti: string[]) =>
    router.replace(urlPopisa(putanja, trenutniParametri(sp), { [parametar]: vrijednosti.length ? vrijednosti : null }), { scroll: false });

  const naziv =
    odabrano.length === 0
      ? "Sve"
      : odabrano.length === 1
        ? (opcije.find((o) => o.vrijednost === odabrano[0])?.naziv ?? odabrano[0])
        : `${odabrano.length} odabrano`;

  return (
    <div className="relative" ref={okvir}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={otvoren}
        aria-controls={id}
        onClick={() => setOtvoren((o) => !o)}
        className={`${klaseUnosa} flex items-center justify-between gap-2 text-left sm:min-w-44`}
      >
        <span className="truncate">
          <span className="text-neutral-500">{oznaka}: </span>
          {naziv}
        </span>
        <span aria-hidden>▾</span>
      </button>
      {otvoren && (
        <div
          id={id}
          role="listbox"
          aria-multiselectable
          aria-label={oznaka}
          className="absolute z-30 mt-1 max-h-72 w-full min-w-56 overflow-auto rounded-md border border-neutral-200 bg-pozadina p-1 shadow-lg dark:border-neutral-800"
        >
          {opcije.map((o) => {
            const ukljuceno = odabrano.includes(o.vrijednost);
            return (
              <label
                key={o.vrijednost}
                role="option"
                aria-selected={ukljuceno}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primarna"
                  checked={ukljuceno}
                  onChange={() => postavi(ukljuceno ? odabrano.filter((x) => x !== o.vrijednost) : [...odabrano, o.vrijednost])}
                />
                {o.naziv}
              </label>
            );
          })}
          {odabrano.length > 0 && (
            <button
              type="button"
              onClick={() => postavi([])}
              className="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-primarna hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Poništi
            </button>
          )}
        </div>
      )}
    </div>
  );
}
