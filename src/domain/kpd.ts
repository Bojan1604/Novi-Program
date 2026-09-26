/**
 * KPD (Klasifikacija proizvoda po djelatnostima) — oznaka na stavkama eRačuna.
 * Oblik: šest znamenki u parovima „NN.NN.NN“ (npr. 26.20.11 — prijenosna računala).
 * Uređaj ima KPD za prodaju i zaseban KPD za najam (najam je usluga, npr. 77.33.11).
 */

export function procitajKpd(upis: string): { ok: true; vrijednost: string } | { ok: false; greska: string } {
  const tekst = upis.trim().replace(/\s+/g, "");
  if (tekst === "") return { ok: false, greska: "Upišite KPD oznaku." };
  const znamenke = tekst.replace(/\./g, "");
  if (!/^\d{6}$/.test(znamenke)) return { ok: false, greska: "KPD oznaka ima 6 znamenki (npr. 26.20.11)." };
  if (/\./.test(tekst) && !/^\d{2}\.\d{2}\.\d{2}$/.test(tekst)) return { ok: false, greska: "KPD oznaka se piše kao NN.NN.NN (npr. 26.20.11)." };
  return { ok: true, vrijednost: `${znamenke.slice(0, 2)}.${znamenke.slice(2, 4)}.${znamenke.slice(4, 6)}` };
}

export function jeKpd(v: unknown): boolean {
  return typeof v === "string" && /^\d{2}\.\d{2}\.\d{2}$/.test(v);
}

/** Zadani KPD firme kad ga stavka nema (6.5): najam, usluga ili roba; odbitak predujma i ručne stavke bez zadanog. */
export function zadaniKpd(
  firma: { kpdRoba: string | null; kpdUsluga: string | null; kpdNajam: string | null },
  s: { vrsta: string; namjena: string; vrstaIsporuke: string },
): string | null {
  if (s.vrsta === "PREDUJAM") return null;
  if (s.namjena === "NAJAM") return firma.kpdNajam;
  return s.vrstaIsporuke === "USLUGA" ? firma.kpdUsluga : firma.kpdRoba;
}
