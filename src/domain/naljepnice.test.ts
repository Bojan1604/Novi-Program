import { describe, expect, it } from "vitest";
import { FORMATI, izgled, moduliCode128, NAJMANJI_QR, NAJUZI_MODUL, POPIS_FORMATA, raspored, sadrzajNaPapiru, unutarIspisa } from "./naljepnice";

const SERIJSKI = ["ABC", "PF3ABC12", "5CD1234XYZ", "CN0H5X2K12345", "SERIJSKI-BROJ-DUG-24ZN", "X".repeat(40)];

describe("ispis bez odrezivanja", () => {
  for (const kljuc of POPIS_FORMATA) {
    it(`${kljuc}: sav sadržaj svih naljepnica na arku unutar područja ispisa, barkod čitljiv`, () => {
      const f = FORMATI[kljuc];
      const naArku = f.stupci * f.redovi;
      for (const s of SERIJSKI) {
        const iz = izgled(f, s);
        for (const { okvir } of raspored(f, naArku)) {
          // naljepnica na papiru
          expect(okvir.x + okvir.w).toBeLessThanOrEqual(f.papir.w + 1e-9);
          expect(okvir.y + okvir.h).toBeLessThanOrEqual(f.papir.h + 1e-9);
          for (const r of sadrzajNaPapiru(okvir, iz)) expect(unutarIspisa(f, r), `${kljuc} ${s} ${JSON.stringify(r)}`).toBe(true);
        }
        if (iz.barkod) expect(iz.barkod.w / moduliCode128(s)).toBeGreaterThanOrEqual(NAJUZI_MODUL);
        // uvijek barem jedan kod koji se može skenirati
        expect(iz.barkod !== null || iz.qr !== null).toBe(true);
        if (iz.qr) expect(iz.qr.w).toBeGreaterThanOrEqual(NAJMANJI_QR);
        // elementi se ne preklapaju s QR kodom
        if (iz.qr) for (const r of [iz.barkod, iz.naziv, iz.serijski]) if (r) expect(r.x).toBeGreaterThanOrEqual(iz.qr.x + iz.qr.w);
      }
    });
  }
});

describe("izgled", () => {
  it("70×37: QR i barkod za uobičajene serijske", () => {
    const iz = izgled(FORMATI["a4-3x8"], "PF3ABC12");
    expect(iz.qr).not.toBeNull();
    expect(iz.barkod).not.toBeNull();
  });
  it("50×25: barkod bez QR-a kad ne stanu oba; dugi serijski samo QR", () => {
    expect(izgled(FORMATI["traka-50x25"], "PF3ABC12")).toMatchObject({ qr: null });
    const dug = izgled(FORMATI["traka-50x25"], "SERIJSKI-BROJ-DUG-24ZN");
    expect(dug.barkod).toBeNull();
    expect(dug.qr).not.toBeNull();
  });
});

describe("raspored na arku", () => {
  it("25 naljepnica 3×8 = 2 arka; redom po recima", () => {
    const r = raspored(FORMATI["a4-3x8"], 25);
    expect(r.at(-1)!.stranica).toBe(1);
    expect(r[0]!.okvir).toEqual({ x: 0, y: 0.5, w: 70, h: 37 });
    expect(r[1]!.okvir.x).toBe(70);
    expect(r[3]!.okvir).toMatchObject({ x: 0, y: 37.5 });
  });
  it("početak od 23. naljepnice (arak djelomično iskorišten)", () => {
    const r = raspored(FORMATI["a4-3x8"], 3, 23);
    expect(r.map((x) => [x.stranica, x.okvir.x, x.okvir.y])).toEqual([
      [0, 70, 0.5 + 7 * 37],
      [0, 140, 0.5 + 7 * 37],
      [1, 0, 0.5],
    ]);
    // neispravan početak → 1 ili zadnja
    expect(raspored(FORMATI["a4-3x8"], 1, -5)[0]!.okvir).toMatchObject({ x: 0, y: 0.5 });
    expect(raspored(FORMATI["a4-3x8"], 1, 999)[0]!.stranica).toBe(0);
  });
  it("printer naljepnica: svaka na svojoj stranici", () => {
    expect(raspored(FORMATI["traka-62x29"], 3).map((x) => x.stranica)).toEqual([0, 1, 2]);
  });
});
