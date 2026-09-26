"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Gumb, GumbVeza } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { klaseUnosa } from "@/components/ui/polje";
import { GumbiSkenera } from "@/components/ui/skener";
import { potvrdiSkeniranje } from "@/components/ui/skener-citac";
import { Kartica } from "@/components/ui/stranica";
import { dodajUSkupno, serijskiIzKoda, type SkeniranaStavka } from "@/domain/skeniranje";
import { STANJA, type Stanje } from "@/domain/stanja-uredaja";
import { provjeriSkeniraneAkcija } from "./akcije";

type Podaci = { id: string; serijski: string; stanje: string; model: string; lokacija: string };
const SPREMISTE = "skeniranje-skupno";

export function Skeniranje() {
  const router = useRouter();
  const [skupno, setSkupno] = useState(false);
  const [popis, setPopis] = useState<SkeniranaStavka[]>([]);
  const [podaci, setPodaci] = useState<Record<string, Podaci | null>>({});
  const [poruka, setPoruka] = useState<{ vrsta: "greska" | "info"; tekst: string } | null>(null);
  const [trazim, setTrazim] = useState(false);
  const unos = useRef<HTMLInputElement>(null);

  // skupni popis preživi osvježavanje i odlazak na karticu uređaja (samo u ovoj kartici preglednika)
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(SPREMISTE) ?? "null") as { popis: SkeniranaStavka[]; podaci: Record<string, Podaci | null> } | null;
      if (s?.popis?.length) {
        // sessionStorage postoji tek u pregledniku (ne pri iscrtavanju na poslužitelju) — vraća se nakon hidracije
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPopis(s.popis);
        setPodaci(s.podaci ?? {});
        setSkupno(true);
      }
    } catch {
      // nema spremljenog popisa
    }
  }, []);
  useEffect(() => {
    try {
      if (popis.length) sessionStorage.setItem(SPREMISTE, JSON.stringify({ popis, podaci }));
      else sessionStorage.removeItem(SPREMISTE);
    } catch {
      // spremanje nije bitno
    }
  }, [popis, podaci]);

  const provjeri = async (lista: string[]) => {
    const r = await provjeriSkeniraneAkcija(lista);
    if (!r.ok) {
      setPoruka({ vrsta: "greska", tekst: r.greska });
      return null;
    }
    const nadjeni = new Map(r.podaci.map((p) => [p.serijski, p]));
    return Object.fromEntries(lista.map((s) => [s, nadjeni.get(s) ?? null]));
  };

  const obradi = async (serijski: string) => {
    setPoruka(null);
    if (!skupno) {
      setTrazim(true);
      const r = await provjeri([serijski]);
      setTrazim(false);
      const u = r?.[serijski];
      if (u) {
        router.push(`/uredaji/${u.id}`);
        return;
      }
      if (r) {
        potvrdiSkeniranje(false);
        setPoruka({ vrsta: "greska", tekst: `Uređaj ${serijski} nije u programu.` });
      }
      return;
    }
    setPopis((p) => dodajUSkupno(p, serijski).popis);
    if (serijski in podaci) return;
    const r = await provjeri([serijski]);
    if (r) {
      setPodaci((d) => ({ ...d, ...r }));
      if (!r[serijski]) potvrdiSkeniranje(false);
    }
  };

  const upisano = (tekst: string) => {
    const s = serijskiIzKoda(tekst);
    if (!s) {
      setPoruka({ vrsta: "greska", tekst: `„${tekst.trim().slice(0, 40)}“ nije ispravan serijski broj.` });
      return;
    }
    void obradi(s);
  };

  const nema = popis.filter((s) => podaci[s.serijski] === null);
  const pronadjeni = popis.filter((s) => podaci[s.serijski]);

  return (
    <>
      <Kartica>
        <div
          className="mb-3 inline-flex overflow-hidden rounded-md border border-neutral-300 text-sm dark:border-neutral-700"
          role="group"
          aria-label="Način"
        >
          {[
            [false, "Pronađi uređaj"],
            [true, "Skupno"],
          ].map(([v, naziv]) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={skupno === v}
              onClick={() => {
                setSkupno(v as boolean);
                setPoruka(null);
                unos.current?.focus();
              }}
              className={`px-3 py-1.5 ${skupno === v ? "bg-primarna text-primarna-tekst" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
            >
              {naziv as string}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Serijski broj (USB skener ili upis, Enter)</span>
            <input
              ref={unos}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              enterKeyHint="search"
              className={`${klaseUnosa} font-mono`}
              placeholder="Skenirajte…"
              aria-label="Serijski broj"
              disabled={trazim}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const el = e.currentTarget;
                if (!el.value.trim()) return;
                upisano(el.value);
                el.value = "";
              }}
            />
          </label>
          <GumbiSkenera skupno={skupno} onSerijski={(s) => void obradi(s)} />
          {trazim && <p className="text-sm text-neutral-600 dark:text-neutral-400">Tražim…</p>}
          {poruka && <Obavijest vrsta={poruka.vrsta}>{poruka.tekst}</Obavijest>}
        </div>
      </Kartica>

      {skupno && (
        <Kartica naslov={`Skenirano: ${popis.length}${nema.length ? ` · nije u programu: ${nema.length}` : ""}`}>
          {popis.length === 0 ? (
            <p className="text-sm text-neutral-500">Skenirajte uređaje jedan za drugim — popis se puni ovdje.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {pronadjeni.length > 0 && (
                  <GumbVeza malen href={`/uredaji?serijski=${pronadjeni.map((s) => encodeURIComponent(s.serijski)).join(",")}`}>
                    Prikaži na popisu uređaja
                  </GumbVeza>
                )}
                <Gumb
                  malen
                  onClick={() => {
                    void navigator.clipboard?.writeText(popis.map((s) => s.serijski).join("\n"));
                    setPoruka({ vrsta: "info", tekst: "Popis serijskih brojeva je kopiran." });
                  }}
                >
                  Kopiraj popis
                </Gumb>
                <Gumb
                  malen
                  varijanta="tihi"
                  onClick={() => {
                    if (!confirm("Očistiti popis skeniranih?")) return;
                    setPopis([]);
                    setPodaci({});
                  }}
                >
                  Očisti
                </Gumb>
              </div>
              <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="skenirani">
                {popis.map((s) => {
                  const u = podaci[s.serijski];
                  return (
                    <li key={s.serijski} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        {u ? (
                          <Link href={`/uredaji/${u.id}`} className="font-mono text-primarna-slova hover:underline">
                            {s.serijski}
                          </Link>
                        ) : (
                          <span className="font-mono">{s.serijski}</span>
                        )}
                        {s.puta > 1 && <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">skenirano {s.puta}×</span>}
                        <div className="text-xs text-neutral-600 dark:text-neutral-400">
                          {u === undefined
                            ? "…"
                            : u === null
                              ? "Nije u programu"
                              : `${u.model} · ${STANJA[u.stanje as Stanje]}${u.lokacija ? ` · ${u.lokacija}` : ""}`}
                        </div>
                      </div>
                      <Gumb
                        malen
                        varijanta="tihi"
                        aria-label={`Ukloni ${s.serijski}`}
                        onClick={() => setPopis((p) => p.filter((x) => x.serijski !== s.serijski))}
                      >
                        Ukloni
                      </Gumb>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Kartica>
      )}
    </>
  );
}
