import { describe, expect, it } from "vitest";
import { dopustenaPolja, mozeSeObrisati, promijenjenaPolja, vezniDokumenti } from "./kartica-uredaja";

const bezVeza = { primka: null, dokumenti: [] };
const sPrimke = { primka: "PRI-1/2026", dokumenti: [{ vrsta: "Primka", broj: "PRI-1/2026" }] };
const naRacunu = {
  primka: "PRI-1/2026",
  dokumenti: [
    { vrsta: "Primka", broj: "PRI-1/2026" },
    { vrsta: "Račun", broj: "R-5/2026" },
    { vrsta: "Račun", broj: "R-5/2026" },
  ],
};

describe("dopuštena polja", () => {
  it("uređaj samo s primke: sve osim nabavne bez prava", () => {
    const r = dopustenaPolja(sPrimke, false);
    expect(r.zakljucano).toBeNull();
    expect(r.polja.has("serijski")).toBe(true);
    expect(r.polja.has("modelId")).toBe(true);
    expect(r.polja.has("nabavnaCijena")).toBe(false);
    expect(r.polja.has("napomena")).toBe(true);
  });

  it("nabavna samo s pravom", () => {
    expect(dopustenaPolja(sPrimke, true).polja.has("nabavnaCijena")).toBe(true);
  });

  it("uređaj na računu: serijski i model zaključani, razlog navodi dokument jednom", () => {
    const r = dopustenaPolja(naRacunu, true);
    expect(r.polja.has("serijski")).toBe(false);
    expect(r.polja.has("modelId")).toBe(false);
    expect(r.polja.has("cpu")).toBe(true);
    expect(r.polja.has("jamstvoDo")).toBe(true);
    expect(r.zakljucano).toBe("Serijski broj i model ne mogu se mijenjati jer je uređaj na dokumentima: Račun R-5/2026.");
  });

  it("vezni dokumenti bez primke i bez ponavljanja; dokument bez broja", () => {
    expect(vezniDokumenti(naRacunu)).toEqual(["Račun R-5/2026"]);
    expect(vezniDokumenti({ primka: null, dokumenti: [{ vrsta: "Servisni nalog", broj: null }] })).toEqual(["Servisni nalog"]);
  });
});

describe("brisanje", () => {
  it("bez veza smije", () => {
    expect(mozeSeObrisati(bezVeza)).toEqual({ ok: true });
  });
  it("s primke ne smije — storno primke", () => {
    const r = mozeSeObrisati(sPrimke);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.razlog).toContain("stornom primke");
  });
  it("na dokumentu ne smije", () => {
    const r = mozeSeObrisati({ primka: null, dokumenti: [{ vrsta: "Ugovor", broj: "U-2/2026" }] });
    expect(r).toEqual({ ok: false, razlog: "Uređaj je na dokumentima (Ugovor U-2/2026) i ne može se obrisati." });
  });
});

describe("promijenjena polja", () => {
  it("prazno = null; samo stvarne promjene", () => {
    expect(promijenjenaPolja({ cpu: "i5", ram: null, os: "" }, { cpu: "i5", ram: "", os: null })).toEqual([]);
    expect(promijenjenaPolja({ cpu: "i5", serijski: "A" }, { cpu: "i7", serijski: "A" })).toEqual(["cpu"]);
    expect(promijenjenaPolja({}, { napomena: "x" })).toEqual(["napomena"]);
  });
});
