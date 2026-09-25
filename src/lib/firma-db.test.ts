import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODELI_S_FIRMOM, MODELI_S_FIRMOM_IZUZETI, ogranicniNaFirmu } from "./firma-db";

describe("popis modela s firmom je potpun", () => {
  it("svaki model sa stupcem firmaId u shemi je ograničen na firmu ili izuzet s razlogom", () => {
    const shema = readFileSync("prisma/schema.prisma", "utf8");
    const modeli = [...shema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , tijelo]) => /^\s+firmaId\s/m.test(tijelo ?? ""))
      .map(([, ime]) => ime!);
    const pokriveni = new Set<string>([...MODELI_S_FIRMOM, ...Object.keys(MODELI_S_FIRMOM_IZUZETI)]);
    expect(modeli.filter((m) => !pokriveni.has(m))).toEqual([]);
    expect(modeli.length).toBeGreaterThan(0);
  });
});

describe("ogranicniNaFirmu", () => {
  const F = "firma-a";

  it("čitanja i promjene dobiju firmaId u where", () => {
    for (const op of ["findUnique", "findUniqueOrThrow", "update", "delete"]) {
      expect(ogranicniNaFirmu("Sesija", op, { where: { id: "x" } }, F).where).toEqual({ id: "x", firmaId: F });
    }
    for (const op of ["findMany", "findFirst", "count", "aggregate", "groupBy", "updateMany", "deleteMany"]) {
      expect(ogranicniNaFirmu("Sesija", op, { where: { id: "x" } }, F).where).toEqual({ AND: [{ id: "x" }, { firmaId: F }] });
    }
  });

  it("traženje tuđe firme ostaje ograničeno i na vlastitu (rezultat prazan)", () => {
    expect(ogranicniNaFirmu("Sesija", "findMany", { where: { firmaId: "firma-b" } }, F).where).toEqual({
      AND: [{ firmaId: "firma-b" }, { firmaId: F }],
    });
    expect(ogranicniNaFirmu("Sesija", "findUnique", { where: { id: "x", firmaId: "firma-b" } }, F).where).toEqual({ id: "x", firmaId: F });
  });

  it("stvaranje dobije firmaId", () => {
    expect(ogranicniNaFirmu("Sesija", "create", { data: { id: "x" } }, F).data).toEqual({ id: "x", firmaId: F });
    expect(ogranicniNaFirmu("Sesija", "createMany", { data: [{ id: "x" }, { id: "y" }] }, F).data).toEqual([
      { id: "x", firmaId: F },
      { id: "y", firmaId: F },
    ]);
  });

  it("zabranjeno pisanje u drugu firmu i premještanje među firmama", () => {
    expect(() => ogranicniNaFirmu("Sesija", "create", { data: { firmaId: "firma-b" } }, F)).toThrow(/drugoj firmi/);
    expect(() => ogranicniNaFirmu("Sesija", "updateMany", { where: {}, data: { firmaId: "firma-b" } }, F)).toThrow(/drugoj firmi/);
    expect(() => ogranicniNaFirmu("Sesija", "create", { data: { firma: { connect: { id: "firma-b" } } } }, F)).toThrow(/firmaId/);
  });

  it("upsert: where i create dobiju firmu", () => {
    const a = ogranicniNaFirmu("Sesija", "upsert", { where: { id: "x" }, create: { id: "x" }, update: {} }, F);
    expect(a.where).toEqual({ id: "x", firmaId: F });
    expect(a.create).toEqual({ id: "x", firmaId: F });
  });

  it("modeli bez firme se ne mijenjaju", () => {
    const args = { where: { id: "x" } };
    expect(ogranicniNaFirmu("Korisnik", "findMany", args, F)).toBe(args);
  });
});
