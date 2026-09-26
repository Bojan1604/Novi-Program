import { describe, expect, it } from "vitest";
import {
  aktivniDani,
  daniUMjesecu,
  kljucRate,
  mjeseci,
  prvaNeizdana,
  provjeriIzmjenuMjeseca,
  provjeriPromjenuCijene,
  rateUgovora,
  rateUredaja,
  razmjerno,
  sljedeciMjesec,
  visak,
  zaIzdati,
  type PlanUredaja,
  type UvjetiUgovora,
} from "./najam";

const U: UvjetiUgovora = { od: "2026-01-01", do: null, otkazan: null };
const plan = (x: Partial<PlanUredaja> = {}): PlanUredaja => ({
  uredajId: "A",
  od: "2026-01-01",
  do: null,
  cijene: [{ od: "2026-01", iznos: 10000 }],
  pauze: [],
  rucno: {},
  ...x,
});
const fak = (o: Record<string, number>) => new Map(Object.entries(o).map(([m, i]) => [kljucRate("A", m), i]));
const iznosi = (u: UvjetiUgovora, p: PlanUredaja, f = fak({}), doM = "2026-03") => rateUredaja(u, p, f, doM).map((r) => [r.mjesec, r.iznos, r.izvor]);

describe("kalendar", () => {
  it("mjeseci, dani, prijelaz godine, prijestupna", () => {
    expect(sljedeciMjesec("2026-12")).toBe("2027-01");
    expect(sljedeciMjesec("2026-01", 13)).toBe("2027-02");
    expect(mjeseci("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect([daniUMjesecu("2026-02"), daniUMjesecu("2028-02"), daniUMjesecu("2026-04"), daniUMjesecu("2026-12")]).toEqual([28, 29, 30, 31]);
    expect(aktivniDani("2026-01", "2026-01-15", null)).toBe(17);
    expect(aktivniDani("2026-02", "2026-01-15", "2026-02-10")).toBe(10);
    expect(aktivniDani("2026-03", "2026-01-15", "2026-02-10")).toBe(0);
    expect(aktivniDani("2026-04", "2026-04-30", "2026-04-30")).toBe(1);
  });
  it("razmjerno: puni mjesec točno, pola centa od nule", () => {
    expect(razmjerno(10000, 31, 31)).toBe(10000);
    expect(razmjerno(10001, 15, 30)).toBe(5001); // 5000,5 → 5001
    expect(razmjerno(10000, 17, 31)).toBe(5484); // 5483,87
    expect(razmjerno(-10001, 15, 30)).toBe(-5001);
  });
});

/** Ručno izračunati primjeri (cijena 100,00 €/mj. osim gdje piše drugačije). */
describe("primjeri rata", () => {
  const primjeri: [string, UvjetiUgovora, PlanUredaja, Map<string, number>, string, (string | number)[][]][] = [
    [
      "puni mjeseci",
      U,
      plan(),
      fak({}),
      "2026-03",
      [
        ["2026-01", 10000, "PLAN"],
        ["2026-02", 10000, "PLAN"],
        ["2026-03", 10000, "PLAN"],
      ],
    ],
    [
      "početak 15.1.: 17/31 dana = 54,84",
      U,
      plan({ od: "2026-01-15" }),
      fak({}),
      "2026-02",
      [
        ["2026-01", 5484, "PLAN"],
        ["2026-02", 10000, "PLAN"],
      ],
    ],
    [
      "povrat 10.2.: 10/28 dana = 35,71; ožujak ništa",
      U,
      plan({ do: "2026-02-10" }),
      fak({}),
      "2026-03",
      [
        ["2026-01", 10000, "PLAN"],
        ["2026-02", 3571, "PLAN"],
      ],
    ],
    [
      "prijestupna veljača 2028: od 15.2. = 15/29 = 51,72",
      { ...U, od: "2028-02-01" },
      plan({ od: "2028-02-15", cijene: [{ od: "2028-02", iznos: 10000 }] }),
      fak({}),
      "2028-02",
      [["2028-02", 5172, "PLAN"]],
    ],
    [
      "nova cijena od ožujka 120,00",
      U,
      plan({
        cijene: [
          { od: "2026-01", iznos: 10000 },
          { od: "2026-03", iznos: 12000 },
        ],
      }),
      fak({}),
      "2026-04",
      [
        ["2026-01", 10000, "PLAN"],
        ["2026-02", 10000, "PLAN"],
        ["2026-03", 12000, "PLAN"],
        ["2026-04", 12000, "PLAN"],
      ],
    ],
    [
      "pauza u veljači",
      U,
      plan({ pauze: ["2026-02"] }),
      fak({}),
      "2026-03",
      [
        ["2026-01", 10000, "PLAN"],
        ["2026-02", 0, "PAUZA"],
        ["2026-03", 10000, "PLAN"],
      ],
    ],
    [
      "ručni iznos za veljaču 50,00",
      U,
      plan({ rucno: { "2026-02": 5000 } }),
      fak({}),
      "2026-02",
      [
        ["2026-01", 10000, "PLAN"],
        ["2026-02", 5000, "RUCNO"],
      ],
    ],
    [
      "fakturirani siječanj 99,99 ostaje i kad se cijena promijeni",
      U,
      plan({ cijene: [{ od: "2026-01", iznos: 20000 }] }),
      fak({ "2026-01": 9999 }),
      "2026-02",
      [
        ["2026-01", 9999, "FAKTURIRANO"],
        ["2026-02", 20000, "PLAN"],
      ],
    ],
    [
      "otkaz 14.2. (raniji od kraja): 14/28 = 50,00",
      { ...U, do: "2026-12-31", otkazan: "2026-02-14" },
      plan(),
      fak({}),
      "2026-06",
      [
        ["2026-01", 10000, "PLAN"],
        ["2026-02", 5000, "PLAN"],
      ],
    ],
    [
      "kraj ugovora 31.3. — plan bez vlastitog kraja prati ugovor",
      { ...U, do: "2026-03-31" },
      plan(),
      fak({}),
      "2026-06",
      [
        ["2026-01", 10000, "PLAN"],
        ["2026-02", 10000, "PLAN"],
        ["2026-03", 10000, "PLAN"],
      ],
    ],
    [
      "uređaj dodan prije početka ugovora: naplata od početka ugovora",
      { ...U, od: "2026-02-01" },
      plan({ od: "2025-12-20" }),
      fak({}),
      "2026-02",
      [["2026-02", 10000, "PLAN"]],
    ],
    [
      "jedan dan (30.4.) od 30,00 = 1,00",
      { ...U, od: "2026-04-01" },
      plan({ od: "2026-04-30", do: "2026-04-30", cijene: [{ od: "2026-04", iznos: 3000 }] }),
      fak({}),
      "2026-05",
      [["2026-04", 100, "PLAN"]],
    ],
    [
      "povrat nakon fakturirane veljače: veljača ostaje s računa",
      U,
      plan({ do: "2026-01-20" }),
      fak({ "2026-01": 10000, "2026-02": 10000 }),
      "2026-03",
      [
        ["2026-01", 10000, "FAKTURIRANO"],
        ["2026-02", 10000, "FAKTURIRANO"],
      ],
    ],
    [
      "prijelaz godine",
      { ...U, od: "2026-12-01" },
      plan({ od: "2026-12-16", cijene: [{ od: "2026-12", iznos: 3100 }] }),
      fak({}),
      "2027-01",
      [
        ["2026-12", 1600, "PLAN"],
        ["2027-01", 3100, "PLAN"],
      ],
    ],
  ];
  it.each(primjeri)("%s", (_n, u, p, f, doM, ocekivano) => {
    expect(iznosi(u, p, f, doM)).toEqual(ocekivano);
  });
});

describe("za izdati, višak, promjene", () => {
  it("za izdati: bez fakturiranih, pauza i nula; više uređaja", () => {
    const p2 = plan({ uredajId: "B", cijene: [{ od: "2026-01", iznos: 0 }] });
    const p3 = plan({ uredajId: "C", od: "2026-02-10", cijene: [{ od: "2026-01", iznos: 2800 }] });
    const r = zaIzdati(U, [plan({ pauze: ["2026-02"] }), p2, p3], fak({ "2026-01": 10000 }), "2026-02");
    expect(r.map((x) => [x.uredajId, x.mjesec, x.iznos])).toEqual([["C", "2026-02", 1900]]); // 19/28 × 28,00
    expect(rateUgovora(U, [plan(), p3], fak({}), "2026-02")).toHaveLength(3);
  });

  it("višak nakon povrata: siječanj 20/31 (64,52 → višak 35,48) i cijela veljača", () => {
    expect(visak(U, plan({ do: "2026-01-20" }), fak({ "2026-01": 10000, "2026-02": 10000 }))).toEqual([
      { mjesec: "2026-01", fakturirano: 10000, sada: 6452, razlika: 3548 },
      { mjesec: "2026-02", fakturirano: 10000, sada: 0, razlika: 10000 },
    ]);
    expect(visak(U, plan(), fak({ "2026-01": 10000 }))).toEqual([]);
    expect(visak({ ...U, otkazan: "2026-01-31" }, plan(), fak({ "2026-01": 10000, "2026-02": 10000 })).map((x) => x.razlika)).toEqual([10000]);
  });

  it("cijena i pauza od prve neizdane rate", () => {
    const f = fak({ "2026-01": 10000, "2026-02": 10000 });
    expect(prvaNeizdana(U, plan(), f)).toBe("2026-03");
    expect(provjeriPromjenuCijene(U, plan(), f, "2026-02", 12000)).toContain("od prve neizdane rate (03/2026)");
    expect(provjeriPromjenuCijene(U, plan(), f, "2026-03", 12000)).toBeNull();
    expect(provjeriPromjenuCijene(U, plan(), f, "2026-03", -1)).toContain("nula ili više");
    expect(provjeriPromjenuCijene(U, plan(), fak({ "2026-05": 1 }), "2026-03", 1)).toContain("već postoji izdana rata");
    expect(provjeriIzmjenuMjeseca(plan(), f, "2026-02")).toContain("izdana");
    expect(provjeriIzmjenuMjeseca(plan(), f, "2026-03")).toBeNull();
    expect(provjeriIzmjenuMjeseca(plan(), f, "2026-13")).toContain("nije ispravan");
  });
});
