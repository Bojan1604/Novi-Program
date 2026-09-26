import Link from "next/link";

/** Veze na prethodnu/sljedeću stranicu; zadržava ostale parametre (filtre). */
export function Stranicenje({
  putanja,
  parametri,
  stranica,
  velicina,
  ukupno,
}: {
  putanja: string;
  parametri: Record<string, string | undefined>;
  stranica: number;
  velicina: number;
  ukupno: number;
}) {
  const zadnja = Math.max(1, Math.ceil(ukupno / velicina));
  const veza = (s: number) => {
    const p = new URLSearchParams(Object.entries(parametri).filter((e): e is [string, string] => !!e[1] && e[0] !== "stranica"));
    if (s > 1) p.set("stranica", String(s));
    const q = p.toString();
    return q ? `${putanja}?${q}` : putanja;
  };
  const od = ukupno === 0 ? 0 : (stranica - 1) * velicina + 1;
  const doo = Math.min(stranica * velicina, ukupno);
  const klase = "rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700";
  return (
    <nav aria-label="Stranice" className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-neutral-600 dark:text-neutral-400">
        {od.toLocaleString("hr-HR")}–{doo.toLocaleString("hr-HR")} od {ukupno.toLocaleString("hr-HR")}
      </span>
      <div className="flex items-center gap-2">
        {stranica > 1 ? (
          <Link href={veza(stranica - 1)} className={`${klase} hover:bg-neutral-100 dark:hover:bg-neutral-800`} rel="prev">
            ‹ Prethodna
          </Link>
        ) : (
          <span className={`${klase} opacity-40`} aria-disabled="true">
            ‹ Prethodna
          </span>
        )}
        <span>
          {stranica} / {zadnja}
        </span>
        {stranica < zadnja ? (
          <Link href={veza(stranica + 1)} className={`${klase} hover:bg-neutral-100 dark:hover:bg-neutral-800`} rel="next">
            Sljedeća ›
          </Link>
        ) : (
          <span className={`${klase} opacity-40`} aria-disabled="true">
            Sljedeća ›
          </span>
        )}
      </div>
    </nav>
  );
}
