import { describe, expect, it } from "vitest";
import { dospjeliMjeseci, zbrojeviTroskova } from "./troskovi";

describe("troškovi", () => {
  it("ponavljajući: od početka do danas, dan u mjesecu, kraći mjesec, drugo pokretanje ništa", () => {
    const p = { od: "2026-01", do: null, dan: 31, zadnji: null };
    expect(dospjeliMjeseci(p, "2026-03-15")).toEqual([
      { mjesec: "2026-01", datum: "2026-01-31" },
      { mjesec: "2026-02", datum: "2026-02-28" },
    ]);
    expect(dospjeliMjeseci({ ...p, zadnji: "2026-02" }, "2026-03-15")).toEqual([]);
    expect(dospjeliMjeseci({ ...p, zadnji: "2026-02" }, "2026-03-31")).toEqual([{ mjesec: "2026-03", datum: "2026-03-31" }]);
    expect(dospjeliMjeseci({ od: "2026-01", do: "2026-02", dan: 1, zadnji: null }, "2026-06-01").map((x) => x.mjesec)).toEqual([
      "2026-01",
      "2026-02",
    ]);
    expect(dospjeliMjeseci({ od: "2026-05", do: null, dan: 1, zadnji: null }, "2026-04-30")).toEqual([]);
    expect(dospjeliMjeseci({ od: "2026-05", do: null, dan: 0, zadnji: null }, "2026-06-30")).toEqual([]);
  });
  it("zbrojevi po mjesecima i kategorijama", () => {
    const z = zbrojeviTroskova(
      [
        { datum: "2026-01-05", kategorija: "Režije", iznos: 100 },
        { datum: "2026-01-20", kategorija: "Režije", iznos: 50 },
        { datum: "2026-03-01", kategorija: "Najam prostora", iznos: 1000 },
      ],
      "2026-01",
      "2026-03",
    );
    expect(z).toEqual({
      mjeseci: ["2026-01", "2026-02", "2026-03"],
      kategorije: ["Najam prostora", "Režije"],
      vrijednosti: [
        [0, 150],
        [0, 0],
        [1000, 0],
      ],
      ukupno: [150, 0, 1000],
    });
  });
});
