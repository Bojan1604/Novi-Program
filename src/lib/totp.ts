import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Prijava u dva koraka (korak 6.4): TOTP prema RFC 6238 (SHA-1, 6 znamenki, 30 s) — radi s Google/Microsoft
 * Authenticatorom i sl. Isti kod ne prolazi dvaput: pamti se zadnji iskorišteni vremenski korak.
 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const PERIOD = 30;

export function base32(b: Uint8Array): string {
  let bitovi = 0;
  let vrijednost = 0;
  let r = "";
  for (const x of b) {
    vrijednost = (vrijednost << 8) | x;
    bitovi += 8;
    while (bitovi >= 5) {
      r += BASE32[(vrijednost >>> (bitovi - 5)) & 31];
      bitovi -= 5;
    }
  }
  if (bitovi > 0) r += BASE32[(vrijednost << (5 - bitovi)) & 31];
  return r;
}

export function izBase32(s: string): Uint8Array {
  const c = s.toUpperCase().replace(/[\s=-]/g, "");
  const r: number[] = [];
  let bitovi = 0;
  let vrijednost = 0;
  for (const z of c) {
    const i = BASE32.indexOf(z);
    if (i < 0) throw new Error("Neispravan base32.");
    vrijednost = (vrijednost << 5) | i;
    bitovi += 5;
    if (bitovi >= 8) {
      r.push((vrijednost >>> (bitovi - 8)) & 255);
      bitovi -= 8;
    }
  }
  return new Uint8Array(r);
}

export function novaTajna(): string {
  return base32(randomBytes(20));
}

export function korak(sada: Date): number {
  return Math.floor(sada.getTime() / 1000 / PERIOD);
}

export function kodZaKorak(tajna: string, k: number, znamenki = 6): string {
  const brojac = Buffer.alloc(8);
  brojac.writeBigUInt64BE(BigInt(k));
  const h = createHmac("sha1", izBase32(tajna)).update(brojac).digest();
  const o = h[h.length - 1]! & 15;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 10 ** znamenki).padStart(znamenki, "0");
}

/**
 * Provjera koda uz toleranciju ±1 korak (sat mobitela). Vraća iskorišteni korak ili null.
 * Korak mora biti noviji od zadnjeg iskorištenog — isti (ili stariji) kod ne prolazi dvaput.
 */
export function provjeriKod(tajna: string, kod: string, sada: Date, zadnjiKorak: number | null): number | null {
  const k = kod.replace(/\s/g, "");
  if (!/^\d{6}$/.test(k)) return null;
  const t = korak(sada);
  for (const x of [t - 1, t, t + 1]) {
    if (zadnjiKorak !== null && x <= zadnjiKorak) continue;
    const ocekivano = kodZaKorak(tajna, x);
    if (timingSafeEqual(Buffer.from(ocekivano), Buffer.from(k))) return x;
  }
  return null;
}

export function otpauthAdresa(tajna: string, email: string, izdavatelj: string): string {
  const oznaka = encodeURIComponent(`${izdavatelj}:${email}`);
  return `otpauth://totp/${oznaka}?secret=${tajna}&issuer=${encodeURIComponent(izdavatelj)}&algorithm=SHA1&digits=6&period=${PERIOD}`;
}

// ——— rezervni kodovi ———

const ZNAKOVI = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 10 jednokratnih rezervnih kodova (XXXX-XXXX); u bazi se čuva samo hash. */
export function rezervniKodovi(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const z = Array.from(b, (x) => ZNAKOVI[x % ZNAKOVI.length]).join("");
    return `${z.slice(0, 4)}-${z.slice(4)}`;
  });
}

export function hashRezervnog(kod: string): string {
  return createHash("sha256").update(kod.toUpperCase().replace(/[\s-]/g, "")).digest("hex");
}
