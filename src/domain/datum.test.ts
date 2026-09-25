import { describe, expect, it } from "vitest";
import {
  danas,
  datum,
  daniUMjesecu,
  dodajDane,
  dodajMjesece,
  formatirajDatum,
  pocetakDana,
  jeDatum,
  procitajDatum,
  razlikaUDanima,
  usporedi,
} from "./datum";

describe("danas — uvijek po Zagrebu, ne po zoni poslužitelja", () => {
  it.each([
    // zima (UTC+1)
    ["2025-12-31T22:59:59Z", "2025-12-31"],
    ["2025-12-31T23:00:00Z", "2026-01-01"],
    // ljeto (UTC+2)
    ["2026-06-30T21:59:59Z", "2026-06-30"],
    ["2026-06-30T22:00:00Z", "2026-07-01"],
    // prelazak na ljetno vrijeme 29.03.2026. u 02:00
    ["2026-03-28T23:30:00Z", "2026-03-29"],
    ["2026-03-29T22:30:00Z", "2026-03-30"],
    // prelazak na zimsko vrijeme 25.10.2026. u 03:00
    ["2026-10-24T22:30:00Z", "2026-10-25"],
    ["2026-10-25T22:59:59Z", "2026-10-25"],
    ["2026-10-25T23:00:00Z", "2026-10-26"],
  ])("%s → %s", (trenutak, ocekivano) => {
    expect(danas(new Date(trenutak))).toBe(ocekivano);
  });

  it("neispravan trenutak baca grešku", () => {
    expect(() => danas(new Date("x"))).toThrow();
  });
});

describe("jeDatum", () => {
  it.each(["2026-01-01", "2024-02-29", "2026-12-31"])("%s je ispravan", (d) => {
    expect(jeDatum(d)).toBe(true);
  });

  it.each(["2026-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "26-01-01", "2026-1-1", "", "1899-12-31", null, 20260101])(
    "%s nije ispravan",
    (d) => {
      expect(jeDatum(d)).toBe(false);
    },
  );
});

describe("procitajDatum", () => {
  it.each([
    ["25.09.2026.", "2026-09-25"],
    ["25.9.2026", "2026-09-25"],
    ["1. 1. 2026.", "2026-01-01"],
    ["2026-09-25", "2026-09-25"],
  ])("„%s“ → %s", (upis, ocekivano) => {
    expect(procitajDatum(upis)).toEqual({ ok: true, vrijednost: ocekivano });
  });

  it.each(["", "31.02.2026.", "25/09/2026", "abc", "25.09.26"])("„%s“ → greška", (upis) => {
    expect(procitajDatum(upis).ok).toBe(false);
  });
});

describe("računanje s datumima", () => {
  it("formatira hrvatski", () => {
    expect(formatirajDatum(datum("2026-09-05"))).toBe("05.09.2026.");
  });

  it("uspoređuje", () => {
    expect(usporedi(datum("2026-01-01"), datum("2025-12-31"))).toBeGreaterThan(0);
    expect(usporedi(datum("2026-01-01"), datum("2026-01-01"))).toBe(0);
    expect(usporedi(datum("2025-12-31"), datum("2026-01-01"))).toBeLessThan(0);
  });

  it("dodaje dane preko kraja godine i prijestupnog dana", () => {
    expect(dodajDane(datum("2025-12-31"), 1)).toBe("2026-01-01");
    expect(dodajDane(datum("2024-02-28"), 1)).toBe("2024-02-29");
    expect(dodajDane(datum("2026-03-01"), -1)).toBe("2026-02-28");
    expect(dodajDane(datum("2026-03-28"), 2)).toBe("2026-03-30"); // preko promjene sata
  });

  it("dodaje mjesece i uzima zadnji dan kad dan ne postoji", () => {
    expect(dodajMjesece(datum("2026-01-31"), 1)).toBe("2026-02-28");
    expect(dodajMjesece(datum("2024-01-31"), 1)).toBe("2024-02-29");
    expect(dodajMjesece(datum("2026-01-15"), 12)).toBe("2027-01-15");
    expect(dodajMjesece(datum("2026-11-30"), 3)).toBe("2027-02-28");
    expect(dodajMjesece(datum("2026-03-31"), -1)).toBe("2026-02-28");
    expect(dodajMjesece(datum("2026-01-10"), -1)).toBe("2025-12-10");
  });

  it("razlika u danima", () => {
    expect(razlikaUDanima(datum("2026-01-01"), datum("2026-12-31"))).toBe(364);
    expect(razlikaUDanima(datum("2026-03-28"), datum("2026-03-30"))).toBe(2);
    expect(razlikaUDanima(datum("2026-02-01"), datum("2026-01-01"))).toBe(-31);
  });

  it("dani u mjesecu", () => {
    expect(daniUMjesecu(2024, 2)).toBe(29);
    expect(daniUMjesecu(2026, 2)).toBe(28);
    expect(daniUMjesecu(2026, 4)).toBe(30);
  });

  it("odbija necijeli broj dana i mjeseci", () => {
    expect(() => dodajDane(datum("2026-01-01"), 1.5)).toThrow();
    expect(() => dodajMjesece(datum("2026-01-01"), 0.5)).toThrow();
  });
});

describe("pocetakDana (ponoć po Zagrebu)", () => {
  it.each([
    ["2026-01-15", "2026-01-14T23:00:00.000Z"],
    ["2026-07-15", "2026-07-14T22:00:00.000Z"],
    ["2026-03-29", "2026-03-28T23:00:00.000Z"], // dan prelaska na ljetno
    ["2026-03-30", "2026-03-29T22:00:00.000Z"],
    ["2026-10-25", "2026-10-24T22:00:00.000Z"], // dan prelaska na zimsko
    ["2026-10-26", "2026-10-25T23:00:00.000Z"],
  ])("%s → %s", (d, ocekivano) => {
    expect(pocetakDana(datum(d)).toISOString()).toBe(ocekivano);
    expect(danas(pocetakDana(datum(d)))).toBe(d);
    expect(danas(new Date(pocetakDana(datum(d)).getTime() - 1))).toBe(dodajDane(datum(d), -1));
  });
});
