import { describe, expect, it } from "vitest";
import { brojRacuna, provjeriDatume, provjeriOznakuProstora, provjeriOznakuUredaja, provjeriPocetniBroj, vrstaBrojacaRacuna } from "./numeracija";

describe("broj računa", () => {
  it("oblik i oznake", () => {
    expect(brojRacuna(12, "PP1", "1")).toBe("12/PP1/1");
    expect(vrstaBrojacaRacuna("racun", "PP1", "1")).toBe("racun:PP1:1");
    expect(provjeriOznakuProstora("POSL1")).toBeNull();
    expect(provjeriOznakuProstora("PP 1")).not.toBeNull();
    expect(provjeriOznakuProstora("")).not.toBeNull();
    expect(provjeriOznakuUredaja("1")).toBeNull();
    expect(provjeriOznakuUredaja("0")).not.toBeNull();
    expect(provjeriOznakuUredaja("a")).not.toBeNull();
  });
});

describe("datumi dokumenta", () => {
  const osnova = { danas: "2026-09-25", zadnjiUGodini: "2026-09-20" };
  it("dopušteno: danas, isti dan kao zadnji, dospijeće isti dan", () => {
    expect(provjeriDatume({ ...osnova, datum: "2026-09-25", dospijece: "2026-10-10" })).toBeNull();
    expect(provjeriDatume({ ...osnova, datum: "2026-09-20", dospijece: "2026-09-20" })).toBeNull();
  });
  it("budućnost, prije zadnjeg, dospijeće prije datuma", () => {
    expect(provjeriDatume({ ...osnova, datum: "2026-09-26" })).toBe("Datum dokumenta ne smije biti u budućnosti.");
    expect(provjeriDatume({ ...osnova, datum: "2026-09-19" })).toBe("Datum ne smije biti prije zadnjeg izdanog dokumenta te vrste (20.09.2026.).");
    expect(provjeriDatume({ ...osnova, datum: "2026-09-25", dospijece: "2026-09-24" })).toBe("Dospijeće ne smije biti prije datuma dokumenta.");
    expect(provjeriDatume({ ...osnova, datum: "2026-13-01" })).toBe("Datum nije ispravan.");
  });
  it("račun od 31.12. ne blokira novu godinu (zadnji se gleda u godini datuma)", () => {
    expect(provjeriDatume({ danas: "2026-01-02", zadnjiUGodini: null, datum: "2026-01-02" })).toBeNull();
    // naknadni račun za prošlu godinu: smije, ako nije prije zadnjeg u toj godini
    expect(provjeriDatume({ danas: "2026-01-02", zadnjiUGodini: "2025-12-31", datum: "2025-12-31" })).toBeNull();
    expect(provjeriDatume({ danas: "2026-01-02", zadnjiUGodini: "2025-12-31", datum: "2025-12-30" })).not.toBeNull();
  });
});

describe("početni broj", () => {
  it("samo naprijed", () => {
    expect(provjeriPocetniBroj(150, 0)).toBeNull();
    expect(provjeriPocetniBroj(150, 149)).toBeNull();
    expect(provjeriPocetniBroj(150, 150)).toBe("Već je izdan broj 150 — početni broj mora biti veći.");
    expect(provjeriPocetniBroj(0, 0)).not.toBeNull();
    expect(provjeriPocetniBroj(1.5, 0)).not.toBeNull();
  });
});
