import { describe, expect, it } from "vitest";
import { jeOib, kontrolnaZnamenkaOib, procitajOib } from "./oib";

describe("OIB", () => {
  // javno objavljeni primjeri ispravnih OIB-a (npr. Porezna uprava u dokumentaciji)
  it.each(["69435151530", "94577403194", "00000000001"])("%s je ispravan", (oib) => {
    expect(jeOib(oib)).toBe(true);
  });

  it.each(["69435151531", "12345678901", "1234567890", "abcdefghijk", "", "694351515300"])("%s nije ispravan", (oib) => {
    expect(jeOib(oib)).toBe(false);
  });

  it("kontrolna znamenka odgovara provjeri za 1.000 nasumičnih brojeva", () => {
    for (let i = 0; i < 1000; i++) {
      const prvih10 = String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
      const oib = prvih10 + kontrolnaZnamenkaOib(prvih10);
      expect(jeOib(oib)).toBe(true);
      const kriva = prvih10 + ((kontrolnaZnamenkaOib(prvih10) + 1) % 10);
      expect(jeOib(kriva)).toBe(false);
    }
  });

  it("čita upis s razmacima i HR prefiksom", () => {
    expect(procitajOib(" HR 694 3515 1530 ")).toEqual({ ok: true, vrijednost: "69435151530" });
    expect(procitajOib("123").ok).toBe(false);
    expect(procitajOib("69435151531")).toEqual({ ok: false, greska: expect.stringContaining("kontrolna") });
    expect(procitajOib("").ok).toBe(false);
  });
});
