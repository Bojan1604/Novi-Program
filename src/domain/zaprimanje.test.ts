import { describe, expect, it } from "vitest";
import { oznakaDokumenta, procitajSerijske } from "./zaprimanje";

describe("zalijepljeni serijski brojevi", () => {
  it("jedan po retku, iz Excela s više stupaca, prazni retci se preskaču", () => {
    const r = procitajSerijske("pf3abc12\r\n\r\n5CD1234XYZ\tIntel i5\t16 GB\n  sn-001 ;x\n");
    expect(r.map((x) => x.serijski)).toEqual(["PF3ABC12", "5CD1234XYZ", "SN-001"]);
    expect(r.every((x) => x.greska === null)).toBe(true);
    expect(r.map((x) => x.red)).toEqual([1, 3, 4]);
  });

  it("dvostruki unos (i s razlikom u velikim slovima) javlja se uz redak prvog", () => {
    const r = procitajSerijske("ABC123\nxyz789\nabc123");
    expect(r[2]).toEqual({ red: 3, izvorno: "abc123", serijski: "ABC123", greska: "Već upisan u retku 1." });
  });

  it("neispravan serijski broj ima grešku, ostali prolaze", () => {
    const r = procitajSerijske("AB\nGOOD123\nLOŠE€");
    expect(r.map((x) => x.greska === null)).toEqual([false, true, false]);
  });

  it("1.000 serijskih odjednom", () => {
    const tekst = Array.from({ length: 1000 }, (_, i) => `SN${String(i).padStart(5, "0")}`).join("\n");
    expect(procitajSerijske(tekst).filter((x) => !x.greska)).toHaveLength(1000);
  });
});

it("oznaka dokumenta", () => {
  expect(oznakaDokumenta("PRI", 12, 2026)).toBe("PRI-12/2026");
});
