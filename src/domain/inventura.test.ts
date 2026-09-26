import { describe, expect, it } from "vitest";
import { opisSkeniranog, usporedi, type UredajUProgramu } from "./inventura";

const u = (serijski: string, skladisteId: string | null, stanje: UredajUProgramu["stanje"] = "NA_SKLADISTU"): UredajUProgramu => ({
  id: `id-${serijski}`,
  serijski,
  stanje,
  skladisteId,
  skladiste: skladisteId === "zg" ? "Zagreb" : skladisteId === "st" ? "Split" : null,
});

describe("inventura", () => {
  it("opis pri skeniranju", () => {
    expect(opisSkeniranog("zg", u("A", "zg"))).toEqual({ rezultat: "PRONADJEN", opis: "Pronađen · Na skladištu" });
    expect(opisSkeniranog("zg", u("B", "st"))).toEqual({ rezultat: "VISAK", opis: "U programu: Na skladištu · Split" });
    expect(opisSkeniranog("zg", u("C", null, "PRODAN"))).toEqual({ rezultat: "VISAK", opis: "U programu: Prodan" });
    expect(opisSkeniranog("zg", null)).toEqual({ rezultat: "NEPOZNAT", opis: "Nije u programu" });
  });

  it("usporedba: pronađeni, manjak, višak (drugo skladište, prodan, nepoznat)", () => {
    const ocekivani = [u("A", "zg"), u("B", "zg", "REZERVIRAN"), u("C", "zg")];
    const r = usporedi("zg", ocekivani, [
      { serijski: "A", uredaj: ocekivani[0]! },
      { serijski: "X", uredaj: u("X", "st") },
      { serijski: "P", uredaj: u("P", null, "PRODAN") },
      { serijski: "N", uredaj: null },
    ]);
    expect(r).toMatchObject({ ocekivano: 3, pronadjeno: 1, manjak: 2, visak: 3 });
    expect(r.stavke.map((s) => [s.serijski, s.rezultat])).toEqual([
      ["A", "PRONADJEN"],
      ["X", "VISAK"],
      ["P", "VISAK"],
      ["N", "NEPOZNAT"],
      ["B", "MANJAK"],
      ["C", "MANJAK"],
    ]);
  });

  it("prazno skladište i ništa skenirano", () => {
    expect(usporedi("zg", [], [])).toEqual({ stavke: [], ocekivano: 0, pronadjeno: 0, manjak: 0, visak: 0 });
  });
});
