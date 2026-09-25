import { describe, expect, it } from "vitest";
import { MASKA, maskiraj, procitajPromjene, razlika, tekstZaPretragu, uTekst } from "./dnevnik";

describe("razlika", () => {
  it("samo promijenjena polja, abecedno; id i firmaId se zanemaruju", () => {
    expect(
      razlika(
        { id: "1", firmaId: "f", ime: "Ana", aktivan: true, grad: "Split" },
        { id: "1", firmaId: "g", ime: "Ana", aktivan: false, grad: "Zagreb" },
      ),
    ).toEqual([
      { polje: "aktivan", staro: "true", novo: "false" },
      { polje: "grad", staro: "Split", novo: "Zagreb" },
    ]);
  });

  it("stvaranje (bez starog) i brisanje (bez novog)", () => {
    expect(razlika(null, { naziv: "X", opis: null })).toEqual([{ polje: "naziv", staro: null, novo: "X" }]);
    expect(razlika({ naziv: "X" }, null)).toEqual([{ polje: "naziv", staro: "X", novo: null }]);
  });

  it("djelomična izmjena: polje koje nije u novom stanju nije promjena", () => {
    expect(razlika({ ime: "Ana", grad: "Split" }, { ime: "Iva" })).toEqual([{ polje: "ime", staro: "Ana", novo: "Iva" }]);
  });

  it("nabavna cijena je označena kao osjetljiva", () => {
    expect(razlika({ nabavnaCijena: "100.00" }, { nabavnaCijena: "120.00" })).toEqual([
      { polje: "nabavnaCijena", staro: "100.00", novo: "120.00", osjetljivo: true },
    ]);
    expect(razlika({ x: 1 }, { x: 2 }, { osjetljiva: ["x"] })[0]?.osjetljivo).toBe(true);
  });

  it("lozinka se nikad ne zapisuje", () => {
    expect(razlika({ lozinkaHash: "$2a$abc" }, { lozinkaHash: "$2a$def" })).toEqual([
      { polje: "lozinkaHash", staro: "(skriveno)", novo: "(promijenjeno)" },
    ]);
  });

  it("datumi i JSON u tekst", () => {
    expect(uTekst(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
    expect(uTekst({ a: 1 })).toBe('{"a":1}');
    expect(razlika({ p: { a: 1 } }, { p: { a: 1 } })).toEqual([]);
  });
});

describe("ugniježđeni podaci (stavke dokumenata)", () => {
  it("nabavna cijena unutar stavki označava cijelo polje kao osjetljivo", () => {
    const [p] = razlika({ stavke: [{ naziv: "A", nabavnaCijena: "10.00" }] }, { stavke: [{ naziv: "A", nabavnaCijena: "12.00" }] });
    expect(p).toMatchObject({ polje: "stavke", osjetljivo: true });
    expect(maskiraj([p!], false)[0]).toMatchObject({ staro: MASKA, novo: MASKA });
    expect(tekstZaPretragu("x", [p!])).not.toContain("12.00");
  });

  it("velika slova u nazivu polja ne zaobilaze maskiranje", () => {
    expect(razlika({ NabavnaCijena: "1" }, { NabavnaCijena: "2" })[0]?.osjetljivo).toBe(true);
    expect(razlika({ MARZA: "1" }, { MARZA: "2" })[0]?.osjetljivo).toBe(true);
  });

  it("lozinka unutar ugniježđenog objekta se ne zapisuje", () => {
    const [p] = razlika({ korisnik: { ime: "A", lozinkaHash: "$2a$12$stari" } }, { korisnik: { ime: "B", lozinkaHash: "$2a$12$novi" } });
    expect(JSON.stringify(p)).not.toContain("$2a$");
    expect(p?.novo).toContain("(skriveno)");
  });

  it("promjena samo tajnog ugniježđenog polja i dalje je zabilježena (bez vrijednosti)", () => {
    const r = razlika({ k: { token: "a" } }, { k: { token: "b" } });
    expect(r).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/"a"|"b"/);
  });

  it("stari zapis iz baze s ugniježđenom nabavnom cijenom maskira se pri čitanju", () => {
    const iz = procitajPromjene([{ polje: "stavke", staro: '[{"nabavnaCijena":"10.00"}]', novo: '[{"nabavnaCijena":"12.00"}]' }]);
    expect(maskiraj(iz, false)[0]).toMatchObject({ staro: MASKA, novo: MASKA });
  });
});

describe("maskiranje", () => {
  const promjene = [
    { polje: "naziv", staro: "A", novo: "B" },
    { polje: "nabavnaCijena", staro: "100.00", novo: "120.00", osjetljivo: true },
    { polje: "marza", staro: null, novo: "20.00", osjetljivo: true },
  ];

  it("bez prava: osjetljive vrijednosti su maska, ostalo vidljivo", () => {
    expect(maskiraj(promjene, false)).toEqual([
      { polje: "naziv", staro: "A", novo: "B" },
      { polje: "nabavnaCijena", staro: MASKA, novo: MASKA, osjetljivo: true },
      { polje: "marza", staro: null, novo: MASKA, osjetljivo: true },
    ]);
  });

  it("s pravom: sve vidljivo", () => {
    expect(maskiraj(promjene, true)).toEqual(promjene);
  });

  it("zapis iz baze bez oznake osjetljivosti se i dalje maskira po nazivu polja", () => {
    const izBaze = procitajPromjene([{ polje: "nabavnaCijena", staro: "1", novo: "2" }]);
    expect(maskiraj(izBaze, false)[0]).toMatchObject({ staro: MASKA, novo: MASKA });
  });

  it("pretraga ne sadrži osjetljive vrijednosti", () => {
    const t = tekstZaPretragu("Promjena modela", promjene);
    expect(t).toContain("naziv");
    expect(t).not.toContain("120.00");
    expect(t).not.toContain("nabavnacijena");
  });

  it("nepouzdan JSON", () => {
    expect(procitajPromjene("x")).toEqual([]);
    expect(procitajPromjene([{ polje: 1 }, null, { polje: "a", staro: 5 }])).toEqual([{ polje: "a", staro: "5", novo: null }]);
  });
});
