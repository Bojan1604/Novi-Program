/**
 * Inventura — čista logika: usporedba skeniranog na polici s onim što program misli da je u skladištu.
 * Inventura ne mijenja uređaje; razlike se ispravljaju dokumentima (izlaz, međuskladišnica) uz odobrenje.
 */
import { STANJA, type Stanje } from "./stanja-uredaja";

export const REZULTATI = {
  PRONADJEN: "Pronađen",
  MANJAK: "Manjak (nije pronađen)",
  VISAK: "Višak (u programu je drugdje)",
  NEPOZNAT: "Nije u programu",
} as const;
export type Rezultat = keyof typeof REZULTATI;

export type UredajUProgramu = { id: string; serijski: string; stanje: Stanje; skladisteId: string | null; skladiste: string | null };

/** Opis skeniranog uređaja odmah pri skeniranju (dok je inventura otvorena). */
export function opisSkeniranog(skladisteId: string, u: UredajUProgramu | null): { rezultat: Exclude<Rezultat, "MANJAK">; opis: string } {
  if (!u) return { rezultat: "NEPOZNAT", opis: REZULTATI.NEPOZNAT };
  if (u.skladisteId === skladisteId) return { rezultat: "PRONADJEN", opis: `${REZULTATI.PRONADJEN} · ${STANJA[u.stanje]}` };
  return { rezultat: "VISAK", opis: `U programu: ${STANJA[u.stanje]}${u.skladiste ? ` · ${u.skladiste}` : ""}` };
}

export type Usporedba = {
  stavke: { serijski: string; uredajId: string | null; rezultat: Rezultat; stanje: Stanje | null; skladiste: string | null }[];
  ocekivano: number;
  pronadjeno: number;
  manjak: number;
  visak: number;
};

/**
 * Zaključenje: očekivani = uređaji koje program vodi u tom skladištu; skenirani = što je stvarno nađeno.
 * Svaki serijski broj pojavljuje se jednom (manjak se dodaje kao nova stavka).
 */
export function usporedi(
  skladisteId: string,
  ocekivani: readonly UredajUProgramu[],
  skenirani: readonly { serijski: string; uredaj: UredajUProgramu | null }[],
): Usporedba {
  const skeniraniSerijski = new Set(skenirani.map((s) => s.serijski));
  const stavke: Usporedba["stavke"] = skenirani.map((s) => {
    const { rezultat } = opisSkeniranog(skladisteId, s.uredaj);
    return {
      serijski: s.serijski,
      uredajId: s.uredaj?.id ?? null,
      rezultat,
      stanje: s.uredaj?.stanje ?? null,
      skladiste: s.uredaj?.skladiste ?? null,
    };
  });
  for (const u of ocekivani) {
    if (!skeniraniSerijski.has(u.serijski))
      stavke.push({ serijski: u.serijski, uredajId: u.id, rezultat: "MANJAK", stanje: u.stanje, skladiste: u.skladiste });
  }
  const broj = (r: Rezultat) => stavke.filter((s) => s.rezultat === r).length;
  return { stavke, ocekivano: ocekivani.length, pronadjeno: broj("PRONADJEN"), manjak: broj("MANJAK"), visak: broj("VISAK") + broj("NEPOZNAT") };
}
