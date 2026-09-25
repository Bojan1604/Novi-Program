import { describe, expect, it } from "vitest";
import { sljedeciSmjer, sortiranje, stranica, urlPopisa, velicina, vise } from "./popis";

describe("parametri popisa", () => {
  it("stranica: samo pozitivan cijeli broj", () => {
    expect(stranica("3")).toBe(3);
    for (const x of ["0", "-1", "1.5", "abc", undefined, "", "99999999"]) expect(stranica(x)).toBe(1);
  });

  it("veličina: samo dopuštene", () => {
    expect(velicina("100")).toBe(100);
    expect(velicina("100000")).toBe(50);
    expect(velicina(undefined)).toBe(50);
  });

  it("više vrijednosti", () => {
    expect(vise(["a", "b,c", "a", " "])).toEqual(["a", "b", "c"]);
    expect(vise("x")).toEqual(["x"]);
    expect(vise(undefined)).toEqual([]);
  });

  it("sortiranje samo po dopuštenim stupcima (inače zadano)", () => {
    const zadano = { kljuc: "naziv", smjer: "asc" } as const;
    expect(sortiranje({ sort: "datum", smjer: "desc" }, ["naziv", "datum"], zadano)).toEqual({ kljuc: "datum", smjer: "desc" });
    expect(sortiranje({ sort: "lozinkaHash" }, ["naziv", "datum"], zadano)).toEqual(zadano);
    expect(sortiranje({ sort: "datum", smjer: "x" }, ["naziv", "datum"], zadano)).toEqual({ kljuc: "datum", smjer: "asc" });
  });

  it("sljedeći smjer", () => {
    expect(sljedeciSmjer({ kljuc: "a", smjer: "asc" }, "a")).toBe("desc");
    expect(sljedeciSmjer({ kljuc: "a", smjer: "desc" }, "a")).toBe("asc");
    expect(sljedeciSmjer({ kljuc: "a", smjer: "asc" }, "b")).toBe("asc");
  });
});

describe("urlPopisa", () => {
  it("promjena filtra vraća na prvu stranicu, ostalo se čuva", () => {
    expect(urlPopisa("/u", { stranica: "3", trazi: "sn", status: ["a", "b"] }, { status: ["c"] })).toBe("/u?trazi=sn&status=c");
  });
  it("promjena stranice čuva filtre", () => {
    expect(urlPopisa("/u", { trazi: "sn" }, { stranica: "2" })).toBe("/u?trazi=sn&stranica=2");
    expect(urlPopisa("/u", { trazi: "sn", stranica: "2" }, { stranica: "1" })).toBe("/u?trazi=sn");
  });
  it("null briše parametar", () => {
    expect(urlPopisa("/u", { trazi: "sn", sort: "a" }, { trazi: null })).toBe("/u?sort=a");
  });
});
