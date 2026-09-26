import { describe, expect, it } from "vitest";
import { provjeriUplatu, stanjePlacanja, type Uplata } from "./uplate";

const u = (iznos: number, ponistena = false): Uplata => ({ iznos, ponistena });

describe("stanje plaćanja — sve kombinacije", () => {
  const SLUCAJEVI: [string, number, Uplata[], { placeno: number; otvoreno: number; zaPovrat: number; status: string }][] = [
    ["bez uplata", 10000, [], { placeno: 0, otvoreno: 10000, zaPovrat: 0, status: "NEPLACEN" }],
    ["djelomična", 10000, [u(4000)], { placeno: 4000, otvoreno: 6000, zaPovrat: 0, status: "DJELOMICNO" }],
    ["dvije djelomične = puna", 10000, [u(4000), u(6000)], { placeno: 10000, otvoreno: 0, zaPovrat: 0, status: "PLACEN" }],
    ["puna odjednom", 10000, [u(10000)], { placeno: 10000, otvoreno: 0, zaPovrat: 0, status: "PLACEN" }],
    ["preplata", 10000, [u(12000)], { placeno: 12000, otvoreno: 0, zaPovrat: 2000, status: "PREPLACEN" }],
    ["preplata pa povrat kupcu", 10000, [u(12000), u(-2000)], { placeno: 10000, otvoreno: 0, zaPovrat: 0, status: "PLACEN" }],
    ["preplata pa djelomičan povrat", 10000, [u(12000), u(-500)], { placeno: 11500, otvoreno: 0, zaPovrat: 1500, status: "PREPLACEN" }],
    ["poništena uplata se ne broji", 10000, [u(10000, true)], { placeno: 0, otvoreno: 10000, zaPovrat: 0, status: "NEPLACEN" }],
    [
      "poništena uplata nakon povrata → opet otvoreno",
      10000,
      [u(12000, true), u(-2000)],
      { placeno: -2000, otvoreno: 12000, zaPovrat: 0, status: "NEPLACEN" },
    ],
    ["poništen povrat → opet za povrat", 10000, [u(12000), u(-2000, true)], { placeno: 12000, otvoreno: 0, zaPovrat: 2000, status: "PREPLACEN" }],
    ["djelomična + poništena", 10000, [u(3000), u(7000, true)], { placeno: 3000, otvoreno: 7000, zaPovrat: 0, status: "DJELOMICNO" }],
    ["odobrenje (negativno), ništa isplaćeno", -5000, [], { placeno: 0, otvoreno: 0, zaPovrat: 5000, status: "PREPLACEN" }],
    ["odobrenje isplaćeno", -5000, [u(-5000)], { placeno: -5000, otvoreno: 0, zaPovrat: 0, status: "PLACEN" }],
    ["račun od 0 €", 0, [], { placeno: 0, otvoreno: 0, zaPovrat: 0, status: "PLACEN" }],
    ["uplata u centima", 12345, [u(12344)], { placeno: 12344, otvoreno: 1, zaPovrat: 0, status: "DJELOMICNO" }],
  ];
  for (const [opis, ukupno, uplate, ocekivano] of SLUCAJEVI) {
    it(opis, () => expect(stanjePlacanja(ukupno, uplate)).toEqual(ocekivano));
  }
});

describe("provjera uplate", () => {
  it("iznos 0 i povrat veći od preplate odbijeni", () => {
    expect(provjeriUplatu(10000, [], 0)).toBe("Upišite iznos.");
    expect(provjeriUplatu(10000, [], -100)).toBe("Kupcu se nema što vratiti — račun nije preplaćen.");
    expect(provjeriUplatu(10000, [u(12000)], -2001)).toBe("Povrat može biti najviše 20,00 €.");
    expect(provjeriUplatu(10000, [u(12000)], -2000)).toBeNull();
    // preplata je dopuštena (kupac platio više) — vidi se kao „za povrat“
    expect(provjeriUplatu(10000, [u(10000)], 500)).toBeNull();
    expect(provjeriUplatu(0, [], 500)).toContain("ne upisuje uplata");
    expect(provjeriUplatu(-5000, [], 500)).toContain("ne upisuje uplata");
  });
});
