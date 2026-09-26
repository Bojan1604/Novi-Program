import { describe, expect, it } from "vitest";
import { razlikaPrihvata, trosakNarudzbenice, uskladenje, type PrimkaTroska, type RacunTroska } from "./trosak-robe";

type Korak =
  | { k: "primka"; id: string; iznos: number }
  | { k: "racun"; id: string; iznos: number; zaRobu: boolean }
  | { k: "storno"; id: string }
  | { k: "brisanje"; id: string };

/** Primijeni korake redom i nakon svakog vrati [roba, zasebno, knjiženje robe tog koraka]. */
function odigraj(koraci: Korak[]) {
  const primke: PrimkaTroska[] = [];
  let racuni: RacunTroska[] = [];
  let knjizeno = { roba: 0, zasebno: 0 };
  return koraci.map((k) => {
    if (k.k === "primka") primke.push({ id: k.id, iznos: k.iznos, aktivna: true });
    else if (k.k === "racun") racuni.push({ id: k.id, iznos: k.iznos, zaRobu: k.zaRobu, aktivan: true });
    else if (k.k === "storno") {
      const p = primke.find((x) => x.id === k.id);
      if (p) p.aktivna = false;
      racuni = racuni.map((r) => (r.id === k.id ? { ...r, aktivan: false } : r));
    } else racuni = racuni.filter((r) => r.id !== k.id);
    const t = trosakNarudzbenice({ primke, racuni });
    const u = uskladenje(knjizeno, t);
    knjizeno = { roba: t.roba, zasebno: t.zasebno };
    return [t.roba, t.zasebno, u.roba];
  });
}

const P = (id: string, iznos: number): Korak => ({ k: "primka", id, iznos });
const R = (id: string, iznos: number): Korak => ({ k: "racun", id, iznos, zaRobu: true });
const T = (id: string, iznos: number): Korak => ({ k: "racun", id, iznos, zaRobu: false });

/** Ručno izračunati scenariji: [naziv, koraci, očekivano nakon svakog koraka: roba, zasebno, knjiženje robe]. */
const SCENARIJI: [string, Korak[], number[][]][] = [
  [
    "primka pa račun jednak",
    [P("p1", 1000), R("r1", 1000)],
    [
      [1000, 0, 1000],
      [1000, 0, 0],
    ],
  ],
  [
    "račun pa primka jednaka",
    [R("r1", 1000), P("p1", 1000)],
    [
      [1000, 0, 1000],
      [1000, 0, 0],
    ],
  ],
  [
    "račun veći od primke: knjiži se razlika",
    [P("p1", 1000), R("r1", 1100)],
    [
      [1000, 0, 1000],
      [1100, 0, 100],
    ],
  ],
  [
    "račun manji od primke: ostaje primka",
    [P("p1", 1000), R("r1", 900)],
    [
      [1000, 0, 1000],
      [1000, 0, 0],
    ],
  ],
  [
    "dva djelomična računa",
    [P("p1", 1000), R("r1", 600), R("r2", 500)],
    [
      [1000, 0, 1000],
      [1000, 0, 0],
      [1100, 0, 100],
    ],
  ],
  [
    "djelomične primke i računi",
    [P("p1", 400), R("r1", 600), P("p2", 600), R("r2", 500)],
    [
      [400, 0, 400],
      [600, 0, 200],
      [1000, 0, 400],
      [1100, 0, 100],
    ],
  ],
  [
    "prijevoz je uvijek zaseban",
    [T("t1", 100), P("p1", 1000), R("r1", 1000)],
    [
      [0, 100, 0],
      [1000, 100, 1000],
      [1000, 100, 0],
    ],
  ],
  [
    "storno primke: ostaje račun",
    [P("p1", 1000), R("r1", 800), { k: "storno", id: "p1" }],
    [
      [1000, 0, 1000],
      [1000, 0, 0],
      [800, 0, -200],
    ],
  ],
  [
    "storno jedine primke bez računa",
    [P("p1", 1000), { k: "storno", id: "p1" }],
    [
      [1000, 0, 1000],
      [0, 0, -1000],
    ],
  ],
  [
    "brisanje računa: vraća se na primku",
    [P("p1", 1000), R("r1", 1200), { k: "brisanje", id: "r1" }],
    [
      [1000, 0, 1000],
      [1200, 0, 200],
      [1000, 0, -200],
    ],
  ],
  [
    "brisanje prijevoza",
    [T("t1", 100), { k: "brisanje", id: "t1" }],
    [
      [0, 100, 0],
      [0, 0, 0],
    ],
  ],
  [
    "storno računa za robu",
    [R("r1", 700), P("p1", 500), { k: "storno", id: "r1" }],
    [
      [700, 0, 700],
      [700, 0, 0],
      [500, 0, -200],
    ],
  ],
];

describe("trošak robe po narudžbenici", () => {
  it.each(SCENARIJI)("%s", (_n, koraci, ocekivano) => {
    expect(odigraj(koraci)).toEqual(ocekivano);
  });

  it("matrica svih redoslijeda: konačni iznos ne ovisi o redoslijedu, zbroj knjiženja = konačni trošak", () => {
    const dogadaji: Korak[] = [P("p1", 1000), P("p2", 300), R("r1", 600), R("r2", 900), T("t1", 150)];
    const permutacije = (l: Korak[]): Korak[][] =>
      l.length <= 1 ? [l] : l.flatMap((x, i) => permutacije([...l.slice(0, i), ...l.slice(i + 1)]).map((r) => [x, ...r]));
    const sve = permutacije(dogadaji);
    expect(sve).toHaveLength(120);
    for (const redoslijed of sve) {
      const koraci = odigraj(redoslijed);
      const zadnji = koraci.at(-1)!;
      expect([zadnji[0], zadnji[1]]).toEqual([1500, 150]); // max(1300, 1500) = 1500, prijevoz 150
      expect(koraci.reduce((a, k) => a + k[2]!, 0)).toBe(1500);
      // nakon svakog koraka: roba = max(primke, računi) do tog trenutka
      let p = 0;
      let r = 0;
      redoslijed.forEach((k, i) => {
        if (k.k === "primka") p += k.iznos;
        if (k.k === "racun" && k.zaRobu) r += k.iznos;
        expect(koraci[i]![0]).toBe(Math.max(p, r));
      });
    }
    // sa stornom i brisanjem na kraju svakog redoslijeda
    for (const redoslijed of sve.slice(0, 30)) {
      const k = odigraj([...redoslijed, { k: "storno", id: "p1" }, { k: "brisanje", id: "r2" }]);
      expect(k.at(-1)!.slice(0, 2)).toEqual([600, 150]); // primke 300, računi 600
      expect(k.reduce((a, x) => a + x[2]!, 0)).toBe(600);
    }
  });

  it("izvor iznosa i neispravni iznosi", () => {
    expect(trosakNarudzbenice({ primke: [], racuni: [] }).izvor).toBe("NEMA");
    expect(trosakNarudzbenice({ primke: [{ id: "p", iznos: 5, aktivna: true }], racuni: [] }).izvor).toBe("PRIMKE");
    expect(trosakNarudzbenice({ primke: [], racuni: [{ id: "r", iznos: 5, zaRobu: true, aktivan: true }] }).izvor).toBe("RACUNI");
    expect(() => trosakNarudzbenice({ primke: [{ id: "p", iznos: -1, aktivna: true }], racuni: [] })).toThrow();
    expect(() => trosakNarudzbenice({ primke: [{ id: "p", iznos: 1.5, aktivna: true }], racuni: [] })).toThrow();
  });

  it("prihvat eRačuna knjiži samo razliku iznad primke", () => {
    const prije = { primke: [{ id: "p1", iznos: 1000, aktivna: true }], racuni: [] };
    expect(razlikaPrihvata(prije, { id: "e1", iznos: 1250, zaRobu: true, aktivan: true })).toBe(250);
    expect(razlikaPrihvata(prije, { id: "e1", iznos: 800, zaRobu: true, aktivan: true })).toBe(0);
    expect(razlikaPrihvata(prije, { id: "e1", iznos: 300, zaRobu: false, aktivan: true })).toBe(0);
  });
});
