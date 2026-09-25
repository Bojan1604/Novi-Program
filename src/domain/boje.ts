/**
 * Boje firme — čista logika. Tekst na boji firme bira se po kontrastu (WCAG),
 * pa bilo koja boja koju firma odabere ostaje čitljiva.
 */

export const ZADANA_BOJA = "#1d4ed8";

export function jeBoja(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

function kanali(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function uHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((x) =>
      Math.round(Math.min(255, Math.max(0, x)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Relativna svjetlina (WCAG 2.x). */
export function svjetlina(hex: string): number {
  const [r, g, b] = kanali(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function kontrast(a: string, b: string): number {
  const [x, y] = [svjetlina(a), svjetlina(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Bijeli ili crni tekst (čisto crni jamči najmanje ~4,58 : 1 za svaku boju) — onaj s većim kontrastom. */
export function tekstNaBoji(pozadina: string): string {
  return kontrast(pozadina, "#ffffff") >= kontrast(pozadina, "#000000") ? "#ffffff" : "#000000";
}

/** Tamnija nijansa (za hover). */
export function tamnija(hex: string, udio = 0.15): string {
  const [r, g, b] = kanali(hex);
  return uHex(r * (1 - udio), g * (1 - udio), b * (1 - udio));
}

/** CSS varijable za boju firme (neispravna boja → zadana). */
export function varijableBoje(boja: string | null | undefined): Record<string, string> {
  const b = jeBoja(boja) ? boja.toLowerCase() : ZADANA_BOJA;
  return { "--primarna": b, "--primarna-tamnija": tamnija(b), "--primarna-tekst": tekstNaBoji(b) };
}
