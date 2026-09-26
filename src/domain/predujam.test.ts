import { describe, expect, it } from "vitest";
import { preostalo, provjeriPredujmove } from "./predujam";

const dostupno = [{ stavkaId: "p1", naziv: "Predujam PRED 1", osnovica: 40000, iskoristeno: 10000 }];

describe("predujam", () => {
  it("preostalo", () => {
    expect(preostalo(dostupno[0]!)).toBe(30000);
    expect(preostalo({ ...dostupno[0]!, iskoristeno: 50000 })).toBe(0);
  });
  it("odbitak do preostalog; račun ne ispod nule", () => {
    expect(provjeriPredujmove({ stavke: [{ izvornaStavkaId: "p1", iznos: -30000 }], dostupno, ukupnoRacuna: 1 })).toBeNull();
    expect(provjeriPredujmove({ stavke: [{ izvornaStavkaId: "p1", iznos: -30001 }], dostupno, ukupnoRacuna: 1 })).toContain("preostalih 300,00");
    expect(
      provjeriPredujmove({
        stavke: [
          { izvornaStavkaId: "p1", iznos: -20000 },
          { izvornaStavkaId: "p1", iznos: -20000 },
        ],
        dostupno,
        ukupnoRacuna: 1,
      }),
    ).toContain("preostalih");
    expect(provjeriPredujmove({ stavke: [{ izvornaStavkaId: "p1", iznos: -30000 }], dostupno, ukupnoRacuna: -1 })).toBe(
      "Predujam je veći od računa — smanjite iznos predujma.",
    );
    expect(provjeriPredujmove({ stavke: [{ izvornaStavkaId: "px", iznos: -1 }], dostupno, ukupnoRacuna: 0 })).toContain("nije s izdanog");
    expect(provjeriPredujmove({ stavke: [{ izvornaStavkaId: "p1", iznos: 100 }], dostupno, ukupnoRacuna: 0 })).toContain("umanjiti");
  });
});
