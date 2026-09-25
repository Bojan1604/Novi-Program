import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODELI_S_FIRMOM, MODELI_S_FIRMOM_IZUZETI, ogranicniNaFirmu, RELACIJE_PREMA_FIRMAMA } from "./firma-db";

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

describe("relacije globalnih modela prema firmama su sve na popisu", () => {
  it.each([
    ["Korisnik", "korisnik"],
    ["Firma", "firma"],
  ])("%s", (model, kljuc) => {
    const shema = readFileSync("prisma/schema.prisma", "utf8");
    const tijelo = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m").exec(shema)![1]!;
    const liste = [...tijelo.matchAll(/^\s+(\w+)\s+\w+\[\]/gm)].map((m) => m[1]!).sort();
    expect([...RELACIJE_PREMA_FIRMAMA[kljuc]!].sort()).toEqual(liste);
  });

  it("svaka relacija između modela firme koristi složeni ključ (firmaId, …)", () => {
    const shema = readFileSync("prisma/schema.prisma", "utf8");
    const modeli = new Set<string>(MODELI_S_FIRMOM);
    const lose: string[] = [];
    for (const [, ime, tijelo] of shema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      if (!modeli.has(ime!)) continue;
      for (const [, polje, cilj, polja] of tijelo!.matchAll(/^\s+(\w+)\s+(\w+)\??\s+@relation\(fields: \[([^\]]+)\]/gm)) {
        if (modeli.has(cilj!) && !polja!.startsWith("firmaId,")) lose.push(`${ime}.${polje}`);
      }
    }
    expect(lose).toEqual([]);
  });
});

describe("ugniježđeni upiti kroz dbFirme", () => {
  const F = "firma-a";
  it("korisnik → članstva (sve firme) je zabranjeno", () => {
    expect(() => ogranicniNaFirmu("ClanstvoFirme", "findMany", { include: { korisnik: { include: { clanstva: true } } } } as never, F)).toThrow(
      /relacije/,
    );
    expect(() =>
      ogranicniNaFirmu("ClanstvoFirme", "findMany", { include: { korisnik: { select: { ime: true, clanstva: true } } } } as never, F),
    ).toThrow(/drugih firmi/);
    expect(() =>
      ogranicniNaFirmu("Uloga", "findMany", { select: { clanstva: { select: { korisnik: { select: { sesije: true } } } } } } as never, F),
    ).toThrow(/drugih firmi/);
  });

  it("obična polja korisnika su dopuštena", () => {
    expect(() =>
      ogranicniNaFirmu("ClanstvoFirme", "findMany", { include: { korisnik: { select: { ime: true, email: true } }, uloga: true } } as never, F),
    ).not.toThrow();
    expect(() => ogranicniNaFirmu("ClanstvoFirme", "findMany", { include: { korisnik: true } } as never, F)).not.toThrow();
  });

  it("ugniježđeni novi zapis bez firmaId ili s tuđim je zabranjen", () => {
    expect(() => ogranicniNaFirmu("Uloga", "create", { data: { naziv: "x", clanstva: { create: { korisnikId: "k" } } } } as never, F)).toThrow(
      /firmaId/,
    );
    expect(() =>
      ogranicniNaFirmu("Uloga", "create", { data: { naziv: "x", clanstva: { create: [{ korisnikId: "k", firmaId: "firma-b" }] } } } as never, F),
    ).toThrow(/firmaId/);
    expect(() =>
      ogranicniNaFirmu("Uloga", "create", { data: { naziv: "x", clanstva: { create: [{ korisnikId: "k", firmaId: F }] } } } as never, F),
    ).not.toThrow();
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
