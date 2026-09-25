/**
 * Predvidljivi „slučajni“ podaci za demo i veliku bazu: isto sjeme = isti podaci
 * (greška se može ponoviti). Svi OIB-i imaju ispravnu kontrolnu znamenku,
 * a datumi idu kronološki.
 */
import { dodajDane, type Datum } from "../../src/domain/datum";
import { kontrolnaZnamenkaOib } from "../../src/domain/oib";

export class Slucajno {
  private stanje: number;

  constructor(sjeme = 20260925) {
    this.stanje = sjeme >>> 0;
  }

  /** mulberry32 — broj u [0, 1) */
  broj(): number {
    this.stanje = (this.stanje + 0x6d2b79f5) >>> 0;
    let t = this.stanje;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** cijeli broj u [od, do] */
  cijeli(od: number, doo: number): number {
    return od + Math.floor(this.broj() * (doo - od + 1));
  }

  izaberi<T>(niz: readonly T[]): T {
    if (niz.length === 0) throw new Error("Prazan niz.");
    return niz[Math.floor(this.broj() * niz.length)]!;
  }

  vjerojatnost(p: number): boolean {
    return this.broj() < p;
  }

  oib(): string {
    const prvih10 = String(this.cijeli(1_000_000_000, 9_999_999_999)).padStart(10, "0");
    return prvih10 + kontrolnaZnamenkaOib(prvih10);
  }

  /** datum u [od, od + dana] */
  datum(od: Datum, dana: number): Datum {
    return dodajDane(od, this.cijeli(0, dana));
  }

  /** niz od n datuma koji ne padaju (kronološki), počevši od `od`, s razmakom 0..najviseRazmak dana */
  kronoloski(od: Datum, n: number, najviseRazmak: number): Datum[] {
    const r: Datum[] = [];
    let d = od;
    for (let i = 0; i < n; i++) {
      d = dodajDane(d, this.cijeli(0, najviseRazmak));
      r.push(d);
    }
    return r;
  }

  serijski(prefiks = ""): string {
    const z = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
    return prefiks + Array.from({ length: 10 }, () => this.izaberi([...z])).join("");
  }
}
