import { describe, expect, it } from "vitest";
import { bezDijakritika, hub3Tekst, jeIban, pozivNaBrojRacuna } from "./hub3";

describe("HUB3", () => {
  it("IBAN kontrola", () => {
    expect(jeIban("HR1210010051863000160")).toBe(true);
    expect(jeIban("HR12 1001 0051 8630 0016 0")).toBe(true);
    expect(jeIban("HR1210010051863000161")).toBe(false);
    expect(jeIban("HR121001005186300016")).toBe(false);
    expect(jeIban("DE89370400440532013000")).toBe(true);
  });
  it("tekst po standardu, dijakritici, duljine", () => {
    const t = hub3Tekst({
      iznos: 125050,
      platitelj: { naziv: "Kupac Čćđšž d.o.o.", adresa: "Ilica 1", mjesto: "10000 Zagreb" },
      primatelj: { naziv: "Firma s vrlo dugim nazivom koji premašuje granicu d.o.o.", adresa: "Savska 41", mjesto: "10000 Zagreb" },
      iban: "HR1210010051863000160",
      model: "HR00",
      pozivNaBroj: pozivNaBrojRacuna(12, 2026),
      sifraNamjene: "OTHR",
      opis: "Račun 12/PP1/1",
    });
    const r = t.split("\n");
    expect(r[0]).toBe("HRVHUB30");
    expect(r[2]).toBe("000000000125050");
    expect(r[3]).toBe("Kupac Ccdsz d.o.o.");
    expect(r[6]).toHaveLength(25);
    expect(r[9]).toBe("HR1210010051863000160");
    expect(r[11]).toBe("12-2026");
    expect(r[13]).toBe("Racun 12/PP1/1");
    expect(bezDijakritika("Žuta ćelija")).toBe("Zuta celija");
  });
  it("nula i krivi IBAN odbijeni", () => {
    const p = {
      iznos: 0,
      platitelj: { naziv: "", adresa: "", mjesto: "" },
      primatelj: { naziv: "", adresa: "", mjesto: "" },
      iban: "HR1210010051863000160",
      model: "HR00",
      pozivNaBroj: "",
      sifraNamjene: "",
      opis: "",
    };
    expect(() => hub3Tekst(p)).toThrow("iznos");
    expect(() => hub3Tekst({ ...p, iznos: 1, iban: "HR00" })).toThrow("IBAN");
  });
});
