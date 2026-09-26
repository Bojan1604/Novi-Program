import { describe, expect, it } from "vitest";
import { jeBoja, kontrast, POZADINE_SVIJETLE, POZADINE_TAMNE, slovaNaPozadini, tamnija, tekstNaBoji, varijableBoje, ZADANA_BOJA } from "./boje";

describe("boje firme", () => {
  it("kontrast crno/bijelo je 21", () => {
    expect(kontrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it.each([
    ["#1d4ed8", "#ffffff"],
    ["#ffeb3b", "#000000"],
    ["#ffffff", "#000000"],
    ["#000000", "#ffffff"],
    ["#e11d48", "#ffffff"],
    ["#a3e635", "#000000"],
  ])("tekst na %s je %s", (pozadina, tekst) => {
    expect(tekstNaBoji(pozadina)).toBe(tekst);
  });

  it("odabrani tekst uvijek ima kontrast najmanje 4,5 : 1 (WCAG AA) za 1.000 boja", () => {
    for (let i = 0; i < 1000; i++) {
      const b = `#${Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0")}`;
      expect(kontrast(b, tekstNaBoji(b))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("tamnija nijansa", () => {
    expect(tamnija("#ffffff", 0.5)).toBe("#808080");
  });

  it("neispravna boja → zadana (nema ubacivanja CSS-a)", () => {
    expect(jeBoja("red; background:url(x)")).toBe(false);
    expect(varijableBoje("red; }")["--primarna"]).toBe(ZADANA_BOJA);
    expect(varijableBoje("#ABCDEF")["--primarna"]).toBe("#abcdef");
  });

  it("slova u boji firme čitljiva su u obje teme za svaku boju (WCAG AA 4,5 : 1)", () => {
    for (const b of ["#1d4ed8", "#0f766e", "#facc15", "#000000", "#ffffff", "#ff0000", "#7c3aed", "#808080"]) {
      const v = varijableBoje(b);
      for (const p of POZADINE_SVIJETLE) expect(kontrast(v["--primarna-slova-svijetla"]!, p), `${b} na ${p}`).toBeGreaterThanOrEqual(4.5);
      for (const p of POZADINE_TAMNE) expect(kontrast(v["--primarna-slova-tamna"]!, p), `${b} na ${p}`).toBeGreaterThanOrEqual(4.5);
    }
    // boja koja je već čitljiva ostaje ista
    expect(slovaNaPozadini("#1d4ed8", POZADINE_SVIJETLE)).toBe("#1d4ed8");
  });
});
