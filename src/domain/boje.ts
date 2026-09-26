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

function pomijesaj(hex: string, prema: string, udio: number): string {
  const [r, g, b] = kanali(hex);
  const [x, y, z] = kanali(prema);
  return uHex(r + (x - r) * udio, g + (y - g) * udio, b + (z - b) * udio);
}

/** Pozadine na kojima stoje slova u boji firme (stranica, redak pod mišem, kartica) — svijetla i tamna tema. */
export const POZADINE_SVIJETLE = ["#ffffff", "#f5f5f5"] as const;
export const POZADINE_TAMNE = ["#0a0a0a", "#171717", "#262626"] as const;

/**
 * Boja slova u boji firme (veze, aktivna stavka izbornika) čitljiva na svim zadanim pozadinama (WCAG AA 4,5 : 1):
 * boja firme, po potrebi potamnjena (svijetla tema) ili posvijetljena (tamna tema) koliko treba.
 */
export function slovaNaPozadini(boja: string, pozadine: readonly string[]): string {
  const prema = pozadine.every((p) => svjetlina(p) > 0.5) ? "#000000" : "#ffffff";
  for (let i = 0; i <= 40; i++) {
    const c = pomijesaj(boja, prema, i / 40);
    if (pozadine.every((p) => kontrast(c, p) >= 4.5)) return c;
  }
  return prema;
}

/** CSS varijable za boju firme (neispravna boja → zadana). */
export function varijableBoje(boja: string | null | undefined): Record<string, string> {
  const b = jeBoja(boja) ? boja.toLowerCase() : ZADANA_BOJA;
  return {
    "--primarna": b,
    "--primarna-tamnija": tamnija(b),
    "--primarna-tekst": tekstNaBoji(b),
    "--primarna-slova-svijetla": slovaNaPozadini(b, POZADINE_SVIJETLE),
    "--primarna-slova-tamna": slovaNaPozadini(b, POZADINE_TAMNE),
  };
}
