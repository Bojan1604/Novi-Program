import { describe, expect, it } from "vitest";
import { provjeriOdobrenje, provjeriStorno, ukupnoZaPlacanje } from "./odobrenja";

const izvorne = [
  { id: "a", naziv: "Laptop", kolicina: 2000, iznos: 200000 },
  { id: "b", naziv: "Dostava", kolicina: 1000, iznos: 1000 },
];
const osnova = { izvorne, izvorUkupno: 251250, vecOdobreno: [], vecOdobrenoUkupno: 0 };

describe("odobrenje", () => {
  it("dio stavke i ukupno unutar ostatka", () => {
    expect(provjeriOdobrenje({ ...osnova, nove: [{ izvornaStavkaId: "a", kolicina: -1000, iznos: -100000 }], ukupno: -125000 })).toBeNull();
  });
  it("količina veća od računa (i zbrojeno s ranijim odobrenjem)", () => {
    expect(provjeriOdobrenje({ ...osnova, nove: [{ izvornaStavkaId: "a", kolicina: -3000, iznos: -300000 }], ukupno: -10 })).toContain(
      "više nego što je bilo",
    );
    expect(
      provjeriOdobrenje({
        ...osnova,
        vecOdobreno: [{ izvornaStavkaId: "a", kolicina: -1000, iznos: -100000 }],
        vecOdobrenoUkupno: -125000,
        nove: [{ izvornaStavkaId: "a", kolicina: -2000, iznos: -200000 }],
        ukupno: -10,
      }),
    ).toContain("više nego što je bilo");
  });
  it("ukupno veće od ostatka — i kad su stavke u granicama (npr. povećana cijena)", () => {
    // točno do ostatka smije
    expect(
      provjeriOdobrenje({ ...osnova, vecOdobrenoUkupno: -250000, nove: [{ izvornaStavkaId: "b", kolicina: -1000, iznos: -1000 }], ukupno: -1250 }),
    ).toBeNull();
    expect(
      provjeriOdobrenje({ ...osnova, vecOdobrenoUkupno: -250001, nove: [{ izvornaStavkaId: "b", kolicina: -1000, iznos: -1000 }], ukupno: -1250 }),
    ).toBe("Odobrenje (12,50 €) je veće od ostatka računa (12,49 €).");
  });
  it("stavka koja nije s računa, pozitivna količina, prazno", () => {
    expect(provjeriOdobrenje({ ...osnova, nove: [{ izvornaStavkaId: "x", kolicina: -1000, iznos: -1 }], ukupno: -1 })).toContain(
      "nije s izvornog računa",
    );
    expect(provjeriOdobrenje({ ...osnova, nove: [{ izvornaStavkaId: "a", kolicina: 1000, iznos: 1 }], ukupno: 1 })).toContain("negativna");
    expect(provjeriOdobrenje({ ...osnova, nove: [], ukupno: 0 })).toBe("Odobrenje nema stavki.");
  });
});

describe("storno", () => {
  it("samo izdani račun bez odobrenja", () => {
    expect(provjeriStorno({ vrsta: "RACUN", status: "IZDAN", brojOdobrenja: 0 })).toBeNull();
    expect(provjeriStorno({ vrsta: "RACUN", status: "STORNIRAN", brojOdobrenja: 0 })).toContain("već storniran");
    expect(provjeriStorno({ vrsta: "RACUN", status: "NACRT", brojOdobrenja: 0 })).toContain("izdani");
    expect(provjeriStorno({ vrsta: "RACUN", status: "IZDAN", brojOdobrenja: 1 })).toContain("odobrenja");
    expect(provjeriStorno({ vrsta: "PONUDA", status: "IZDAN", brojOdobrenja: 0 })).toContain("samo račun");
    expect(provjeriStorno({ vrsta: "PREDUJAM", status: "IZDAN", brojOdobrenja: 0 })).toBeNull();
    expect(provjeriStorno({ vrsta: "PREDUJAM", status: "IZDAN", brojOdobrenja: 0, predujamIskoristen: true })).toContain("već odbijen");
  });
  it("storniran račun i storno se ne naplaćuju", () => {
    expect(ukupnoZaPlacanje("RACUN", "STORNIRAN", 1000)).toBe(0);
    expect(ukupnoZaPlacanje("STORNO", "IZDAN", -1000)).toBe(0);
    expect(ukupnoZaPlacanje("ODOBRENJE", "IZDAN", -1000)).toBe(-1000);
  });
});
