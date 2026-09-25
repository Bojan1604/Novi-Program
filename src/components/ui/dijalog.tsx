"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Dijalog (modalni prozor) na izvornom <dialog>: fokus ostaje unutra, Esc zatvara
 * (osim kad ga je već obradila komponenta unutra, npr. otvoren popis pretraživača).
 */
export function Dijalog({
  otvoren,
  onZatvori,
  naslov,
  children,
  sirina = "md",
}: {
  otvoren: boolean;
  onZatvori: () => void;
  naslov: ReactNode;
  children: ReactNode;
  sirina?: "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // zatvaranje klikom na pozadinu samo ako je i pritisak mišem bio na pozadini
  // (inače označavanje teksta koje završi izvan dijaloga zatvori obrazac)
  const pritisakNaPozadini = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (otvoren && !d.open) d.showModal();
    if (!otvoren && d.open) d.close();
  }, [otvoren]);

  const max = { md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl" }[sirina];

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onZatvori();
      }}
      onMouseDown={(e) => {
        pritisakNaPozadini.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && pritisakNaPozadini.current) onZatvori();
        pritisakNaPozadini.current = false;
      }}
      className={`m-auto w-[calc(100%-2rem)] ${max} rounded-xl border border-neutral-200 bg-pozadina p-0 text-tekst shadow-2xl backdrop:bg-black/40 dark:border-neutral-800`}
    >
      {otvoren && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-lg font-semibold">{naslov}</h2>
            <button
              type="button"
              aria-label="Zatvori"
              onClick={onZatvori}
              className="rounded-md px-2 py-1 text-xl leading-none text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              ×
            </button>
          </div>
          <div className="overflow-y-auto p-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
