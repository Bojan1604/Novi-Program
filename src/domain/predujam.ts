/**
 * Predujam (korak 2.7) — čista pravila. Iznosi u centima (osnovica bez PDV-a).
 * Konačni račun odbija predujam negativnim stavkama „Predujam po računu …“ po istoj stopi PDV-a,
 * pa je PDV na konačnom računu samo na razliku, a plaćeno predujmom nikad veće od računa (BR-CO-16).
 */

export type PreostaloPredujma = { stavkaId: string; naziv: string; osnovica: number; iskoristeno: number };

/** Koliko je od svake stavke predujma još slobodno. */
export function preostalo(p: PreostaloPredujma): number {
  return Math.max(p.osnovica - p.iskoristeno, 0);
}

/**
 * Provjera stavki predujma na konačnom računu:
 *  - svaka se odnosi na stavku izdanog predujma istog kupca;
 *  - iznos (apsolutno) ≤ preostalo te stavke (zbrojeno ako se ista stavka pojavi više puta);
 *  - ukupno konačnog računa nakon odbitka ≥ 0 (predujam ne smije biti veći od računa).
 */
export function provjeriPredujmove(p: {
  stavke: readonly { izvornaStavkaId: string | null; iznos: number }[];
  dostupno: readonly PreostaloPredujma[];
  ukupnoRacuna: number;
}): string | null {
  const mapa = new Map(p.dostupno.map((x) => [x.stavkaId, x]));
  const koristi = new Map<string, number>();
  for (const s of p.stavke) {
    const d = s.izvornaStavkaId ? mapa.get(s.izvornaStavkaId) : undefined;
    if (!d) return "Predujam nije s izdanog računa za predujam ovog kupca.";
    if (s.iznos >= 0) return `Predujam „${d.naziv}“ mora umanjiti račun (negativan iznos).`;
    const ukupno = (koristi.get(d.stavkaId) ?? 0) + Math.abs(s.iznos);
    if (ukupno > preostalo(d)) return `Predujam „${d.naziv}“: odbija se više od preostalih ${(preostalo(d) / 100).toFixed(2).replace(".", ",")} €.`;
    koristi.set(d.stavkaId, ukupno);
  }
  if (p.ukupnoRacuna < 0) return "Predujam je veći od računa — smanjite iznos predujma.";
  return null;
}
