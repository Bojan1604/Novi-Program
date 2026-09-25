import { klaseGumba } from "./gumb";

/** Gumbi za izvoz trenutnog popisa (s istim filtrima). */
export function GumbiIzvoza({ izvor, parametri }: { izvor: string; parametri: Record<string, string | string[] | undefined> }) {
  const veza = (format: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(parametri)) {
      if (k === "stranica" || v === undefined) continue;
      for (const x of Array.isArray(v) ? v : [v]) if (x) p.append(k, x);
    }
    p.set("format", format);
    return `/api/izvoz/${izvor}?${p.toString()}`;
  };
  return (
    <div className="flex flex-wrap gap-2" aria-label="Izvoz">
      {(["xlsx", "csv", "pdf"] as const).map((f) => (
        <a key={f} href={veza(f)} className={klaseGumba("sekundarni", true)} download>
          {f === "xlsx" ? "Excel" : f.toUpperCase()}
        </a>
      ))}
    </div>
  );
}
