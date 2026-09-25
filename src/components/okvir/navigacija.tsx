"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type StavkaNav = { naziv: string; putanja: string; grupa: string };

function jeAktivna(putanja: string, trenutna: string): boolean {
  return putanja === "/" ? trenutna === "/" : trenutna === putanja || trenutna.startsWith(`${putanja}/`);
}

function Popis({ stavke, trenutna, onOdabir }: { stavke: StavkaNav[]; trenutna: string; onOdabir?: () => void }) {
  const grupe = [...new Set(stavke.map((s) => s.grupa))];
  return (
    <nav aria-label="Glavni izbornik" className="flex flex-col gap-4">
      {grupe.map((g) => (
        <div key={g}>
          <div className="mb-1 px-3 text-xs font-semibold tracking-wide text-neutral-500 uppercase">{g}</div>
          <ul className="flex flex-col">
            {stavke
              .filter((s) => s.grupa === g)
              .map((s) => {
                const aktivna = jeAktivna(s.putanja, trenutna);
                return (
                  <li key={s.putanja}>
                    <Link
                      href={s.putanja}
                      onClick={onOdabir}
                      aria-current={aktivna ? "page" : undefined}
                      className={`block rounded-md px-3 py-2 text-sm ${
                        aktivna
                          ? "bg-primarna/10 font-medium text-primarna"
                          : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      }`}
                    >
                      {s.naziv}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function BocniIzbornik({ stavke }: { stavke: StavkaNav[] }) {
  const trenutna = usePathname();
  return <Popis stavke={stavke} trenutna={trenutna} />;
}

export function MobilniIzbornik({ stavke }: { stavke: StavkaNav[] }) {
  const trenutna = usePathname();
  const [otvoren, setOtvoren] = useState(false);

  useEffect(() => {
    if (!otvoren) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOtvoren(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [otvoren]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Izbornik"
        aria-expanded={otvoren}
        onClick={() => setOtvoren((o) => !o)}
        className="inline-flex size-10 items-center justify-center rounded-md border border-neutral-300 dark:border-neutral-700"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          {otvoren ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {otvoren && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setOtvoren(false)} aria-hidden />
          <div className="fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-y-auto bg-pozadina p-3 shadow-xl">
            <Popis stavke={stavke} trenutna={trenutna} onOdabir={() => setOtvoren(false)} />
          </div>
        </>
      )}
    </div>
  );
}
