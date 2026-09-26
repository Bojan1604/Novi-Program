import { formatirajIznos, type Centi } from "./novac";
/**
 * Uplate po računu — čista logika (korak 2.5). Iznosi u centima.
 * Uplata je pozitivna (kupac plaća), povrat kupcu negativan. Poništene se ne broje.
 * Saldo = ukupno računa − plaćeno: > 0 → otvoreno (kupac duguje), < 0 → za povrat (mi dugujemo).
 * Isto vrijedi za odobrenja (negativan ukupno): ono što kupcu dugujemo je „za povrat“.
 */

export type Uplata = { iznos: number; ponistena: boolean };

export type StatusPlacanja = "NEPLACEN" | "DJELOMICNO" | "PLACEN" | "PREPLACEN";

export const NAZIVI_STATUSA: Record<StatusPlacanja, string> = {
  NEPLACEN: "Neplaćen",
  DJELOMICNO: "Djelomično plaćen",
  PLACEN: "Plaćen",
  PREPLACEN: "Preplaćen (za povrat)",
};

export type StanjePlacanja = { placeno: number; otvoreno: number; zaPovrat: number; status: StatusPlacanja };

export function stanjePlacanja(ukupno: number, uplate: readonly Uplata[]): StanjePlacanja {
  const placeno = uplate.filter((u) => !u.ponistena).reduce((a, u) => a + u.iznos, 0);
  const saldo = ukupno - placeno;
  const otvoreno = Math.max(saldo, 0);
  const zaPovrat = Math.max(-saldo, 0);
  let status: StatusPlacanja;
  if (zaPovrat > 0) status = "PREPLACEN";
  else if (otvoreno === 0) status = "PLACEN";
  else if ((ukupno >= 0 && placeno > 0) || (ukupno < 0 && placeno < 0)) status = "DJELOMICNO";
  else status = "NEPLACEN";
  return { placeno, otvoreno, zaPovrat, status };
}

/**
 * Provjera nove uplate / povrata:
 *  - iznos različit od 0;
 *  - povrat (negativan) najviše do iznosa „za povrat“ — ne vraća se više nego što je preplaćeno.
 */
export function provjeriUplatu(ukupno: number, uplate: readonly Uplata[], iznos: number): string | null {
  if (!Number.isSafeInteger(iznos) || iznos === 0) return "Upišite iznos.";
  if (iznos > 0 && ukupno <= 0) return "Na ovaj dokument se ne upisuje uplata (storniran račun ili odobrenje) — samo povrat kupcu.";
  const s = stanjePlacanja(ukupno, uplate);
  if (iznos < 0 && -iznos > s.zaPovrat) {
    return s.zaPovrat === 0
      ? "Kupcu se nema što vratiti — račun nije preplaćen."
      : `Povrat može biti najviše ${formatirajIznos(s.zaPovrat as Centi, true)}.`;
  }
  return null;
}
