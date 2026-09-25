"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Vrsta = "uspjeh" | "greska" | "info";
type Poruka = { id: number; tekst: string; vrsta: Vrsta };

const Kontekst = createContext<(tekst: string, vrsta?: Vrsta) => void>(() => {});

/** Kratke poruke u kutu ekrana („Spremljeno.“) — nestaju same; greške ostaju dok se ne zatvore. */
export function PorukeOkvir({ children }: { children: ReactNode }) {
  const [poruke, setPoruke] = useState<Poruka[]>([]);
  const ukloni = useCallback((id: number) => setPoruke((p) => p.filter((x) => x.id !== id)), []);
  const pokazi = useCallback(
    (tekst: string, vrsta: Vrsta = "uspjeh") => {
      const id = Date.now() + Math.random();
      setPoruke((p) => [...p.slice(-3), { id, tekst, vrsta }]);
      if (vrsta !== "greska") setTimeout(() => ukloni(id), 4000);
    },
    [ukloni],
  );
  const boje: Record<Vrsta, string> = {
    uspjeh: "bg-green-700 text-white",
    greska: "bg-red-700 text-white",
    info: "bg-neutral-800 text-white",
  };
  return (
    <Kontekst.Provider value={pokazi}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:right-4 sm:left-auto sm:items-end"
      >
        {poruke.map((p) => (
          <div
            key={p.id}
            role={p.vrsta === "greska" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg px-4 py-2.5 text-sm shadow-lg ${boje[p.vrsta]}`}
          >
            <span className="flex-1">{p.tekst}</span>
            <button type="button" aria-label="Zatvori poruku" onClick={() => ukloni(p.id)} className="opacity-80 hover:opacity-100">
              ×
            </button>
          </div>
        ))}
      </div>
    </Kontekst.Provider>
  );
}

export function usePoruke() {
  return useContext(Kontekst);
}
