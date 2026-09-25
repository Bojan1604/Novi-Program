import type { ReactNode } from "react";

export function Stranica({ children, sirina = "5xl" }: { children: ReactNode; sirina?: "3xl" | "5xl" | "7xl" | "puna" }) {
  const max = { "3xl": "max-w-3xl", "5xl": "max-w-5xl", "7xl": "max-w-7xl", puna: "" }[sirina];
  return <main className={`mx-auto flex w-full ${max} flex-1 flex-col gap-4 px-4 py-5 sm:px-6`}>{children}</main>;
}

export function NaslovStranice({ naslov, opis, akcije }: { naslov: ReactNode; opis?: ReactNode; akcije?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{naslov}</h1>
        {opis && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{opis}</p>}
      </div>
      {akcije && <div className="flex flex-wrap gap-2">{akcije}</div>}
    </div>
  );
}

export function Kartica({ children, naslov, className = "" }: { children: ReactNode; naslov?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 ${className}`}>
      {naslov && <h2 className="mb-3 text-base font-semibold">{naslov}</h2>}
      {children}
    </section>
  );
}

export function Znacka({ children, boja = "siva" }: { children: ReactNode; boja?: "siva" | "zelena" | "crvena" | "plava" | "zuta" }) {
  const b = {
    siva: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    zelena: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    crvena: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    plava: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    zuta: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  }[boja];
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${b}`}>{children}</span>;
}
