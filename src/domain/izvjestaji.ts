import { jeDatum } from "./datum";
import { jedan, type ParametriUrl } from "./popis";

/**
 * Izvještaji (korak 6.1) — čista pravila filtara: godina („Sve“ ili godina) i razdoblje od–do.
 * Godina i razdoblje se sijeku: „2026“ + od 1.3. = 1.3.–31.12.2026.
 */
export type Razdoblje = { godina: number | "sve"; od: string | null; do: string | null };

export function procitajRazdoblje(sp: ParametriUrl, danas: string): Razdoblje {
  const g = jedan(sp["godina"]);
  const godina = g === "sve" ? "sve" : g && /^\d{4}$/.test(g) && Number(g) >= 2000 && Number(g) <= 2100 ? Number(g) : Number(danas.slice(0, 4));
  const od = jedan(sp["od"]);
  const doD = jedan(sp["do"]);
  return { godina, od: od && jeDatum(od) ? od : null, do: doD && jeDatum(doD) ? doD : null };
}

/** Stvarne granice za upit (null = bez granice); prazno razdoblje (od > do) daje od > do i upit ne vraća ništa. */
export function granice(r: Razdoblje): { od: string | null; do: string | null } {
  const god = r.godina === "sve" ? null : { od: `${r.godina}-01-01`, do: `${r.godina}-12-31` };
  const od =
    [god?.od, r.od]
      .filter((x): x is string => !!x)
      .sort()
      .at(-1) ?? null;
  const doD = [god?.do, r.do].filter((x): x is string => !!x).sort()[0] ?? null;
  return { od, do: doD };
}

/** Godine za odabir (od najnovije) — od prve godine s podacima do tekuće. */
export function godineZaOdabir(prva: number | null, danas: string): number[] {
  const sad = Number(danas.slice(0, 4));
  const od = Math.min(prva ?? sad, sad);
  return Array.from({ length: sad - od + 1 }, (_, i) => sad - i);
}
