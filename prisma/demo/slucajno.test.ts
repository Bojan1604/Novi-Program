import { describe, expect, it } from "vitest";
import { usporedi } from "../../src/domain/datum";
import { datum } from "../../src/domain/datum";
import { jeOib } from "../../src/domain/oib";
import { Slucajno } from "./slucajno";

describe("demo podaci — slučajni ali predvidljivi", () => {
  it("isto sjeme daje iste podatke", () => {
    const a = new Slucajno(1);
    const b = new Slucajno(1);
    expect(Array.from({ length: 5 }, () => a.oib())).toEqual(Array.from({ length: 5 }, () => b.oib()));
  });

  it("svi OIB-i su ispravni", () => {
    const s = new Slucajno(7);
    for (let i = 0; i < 2000; i++) expect(jeOib(s.oib())).toBe(true);
  });

  it("kronološki datumi ne idu unatrag", () => {
    const d = new Slucajno(3).kronoloski(datum("2025-01-01"), 500, 5);
    for (let i = 1; i < d.length; i++) expect(usporedi(d[i - 1]!, d[i]!)).toBeLessThanOrEqual(0);
  });

  it("cijeli brojevi u granicama", () => {
    const s = new Slucajno(9);
    for (let i = 0; i < 1000; i++) {
      const n = s.cijeli(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
});
