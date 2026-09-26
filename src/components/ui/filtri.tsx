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
  const izUrla = sp.getAll(parametar).flatMap((x) => x.split(","));
  // Odabir se prikazuje odmah (lokalno), a iz adrese se preuzima tek kad adresa stigne do zadnjeg odabira —
  // inače drugi brzi klik gradi na staroj adresi i poništi prvi (greška viđena na sporom CI-u).
  const [lokalno, setLokalno] = useState<string[] | null>(null);
  if (lokalno && [...lokalno].sort().join(",") === [...izUrla].sort().join(",")) setLokalno(null);
  const odabrano = lokalno ?? izUrla;
  const [otvoren, setOtvoren] = useState(false);
  const id = useId();
  const okvir = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!otvoren) return;
    const klik = (e: MouseEvent) => okvir.current && !okvir.current.contains(e.target as Node) && setOtvoren(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // zatvori samo popis filtra, ne i dijalog oko njega
        e.preventDefault();
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

  const postavi = (vrijednosti: string[]) => {
    setLokalno(vrijednosti);
    router.replace(urlPopisa(putanja, trenutniParametri(sp), { [parametar]: vrijednosti.length ? vrijednosti : null }), { scroll: false });
  };

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
              className="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-primarna-slova hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Poništi
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Razdoblje (?od=YYYY-MM-DD&do=YYYY-MM-DD); prazno polje briše granicu. */
export function FilterRazdoblja({ oznaka = "Razdoblje" }: { oznaka?: string }) {
  const router = useRouter();
  const putanja = usePathname();
  const sp = useSearchParams();
  const [, zapocni] = useTransition();
  const id = useId();
  const promijeni = (parametar: "od" | "do", v: string) =>
    zapocni(() =>
      router.replace(urlPopisa(putanja, trenutniParametri(sp), { [parametar]: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null }), { scroll: false }),
    );
  return (
    <fieldset className="flex min-w-0 items-center gap-1 text-sm" aria-labelledby={id}>
      <span id={id} className="sr-only">
        {oznaka}
      </span>
      <input
        type="date"
        aria-label="Od datuma"
        defaultValue={sp.get("od") ?? ""}
        onChange={(e) => promijeni("od", e.target.value)}
        className={`${klaseUnosa} w-0 min-w-0 flex-1 sm:w-36 sm:flex-none`}
      />
      <span aria-hidden>–</span>
      <input
        type="date"
        aria-label="Do datuma"
        defaultValue={sp.get("do") ?? ""}
        onChange={(e) => promijeni("do", e.target.value)}
        className={`${klaseUnosa} w-0 min-w-0 flex-1 sm:w-36 sm:flex-none`}
      />
    </fieldset>
  );
}

/** Godina izvještaja: „Sve“ ili jedna godina (?godina=2026|sve); zadana je tekuća godina (bez parametra). */
export function FilterGodina({ godine, zadano }: { godine: number[]; zadano: number }) {
  const router = useRouter();
  const putanja = usePathname();
  const sp = useSearchParams();
  const [, zapocni] = useTransition();
  const vrijednost = sp.get("godina") ?? String(zadano);
  return (
    <select
      aria-label="Godina"
      value={vrijednost}
      onChange={(e) =>
        zapocni(() =>
          router.replace(urlPopisa(putanja, trenutniParametri(sp), { godina: e.target.value === String(zadano) ? null : e.target.value }), {
            scroll: false,
          }),
        )
      }
      className={`${klaseUnosa} sm:w-32`}
    >
      <option value="sve">Sve godine</option>
      {godine.map((g) => (
        <option key={g} value={String(g)}>
          {g}.
        </option>
      ))}
    </select>
  );
}
