"use client";

import { useState } from "react";

export type Tema = "sustav" | "svijetla" | "tamna";
const REDOSLIJED: Tema[] = ["sustav", "svijetla", "tamna"];
const NAZIVI: Record<Tema, string> = { sustav: "Tema: prema sustavu", svijetla: "Tema: svijetla", tamna: "Tema: tamna" };

/** Prekidač teme; pamti se u kolačiću pa poslužitelj odmah šalje pravu temu (bez bljeska). */
export function PrekidacTeme({ pocetna }: { pocetna: Tema }) {
  const [tema, setTema] = useState<Tema>(pocetna);
  const promijeni = () => {
    const nova = REDOSLIJED[(REDOSLIJED.indexOf(tema) + 1) % REDOSLIJED.length]!;
    setTema(nova);
    document.cookie = `tema=${nova}; path=/; max-age=${400 * 24 * 3600}; samesite=lax`;
    if (nova === "sustav") delete document.documentElement.dataset["tema"];
    else document.documentElement.dataset["tema"] = nova;
  };
  return (
    <button
      type="button"
      onClick={promijeni}
      aria-label={NAZIVI[tema]}
      title={NAZIVI[tema]}
      className="inline-flex size-9 items-center justify-center rounded-md border border-neutral-300 text-base dark:border-neutral-700"
    >
      <span aria-hidden>{tema === "tamna" ? "☾" : tema === "svijetla" ? "☀" : "◐"}</span>
    </button>
  );
}
