import { describe, expect, it } from "vitest";
import { izvedeniPdvStatus, jePostanskiBrojHr, pdvStatus, procitajEracunAdresu, procitajPdvBroj } from "./partner";

describe("PDV broj", () => {
  it.each([
    ["DE 123 456 789", "DE", "DE123456789"],
    ["123456789", "DE", "DE123456789"],
    ["hr69435151530", "HR", "HR69435151530"],
    ["69435151530", "HR", "HR69435151530"],
    ["ATU12345678", "AT", "ATU12345678"],
    ["EL123456789", "GR", "EL123456789"],
    ["123456789", "GR", "EL123456789"],
    ["NL123456789B01", "NL", "NL123456789B01"],
    ["si-12345678", "SI", "SI12345678"],
  ])("„%s“ (%s) → %s", (u, d, v) => expect(procitajPdvBroj(u, d)).toEqual({ ok: true, vrijednost: v }));

  it.each([
    ["", "DE"],
    ["DE12345678", "DE"], // 8 znamenki
    ["FR12345678901", "DE"], // druga država
    ["HR69435151531", "HR"], // kriva kontrolna znamenka OIB-a
    ["US123456789", "US"],
    ["ABC", "IT"],
  ])("„%s“ (%s) → greška", (u, d) => expect(procitajPdvBroj(u, d).ok).toBe(false));
});

describe("porezni status partnera", () => {
  it.each([
    ["HR", null, "DOMACI"],
    ["HR", "HR69435151530", "DOMACI"],
    ["DE", "DE123456789", "EU_OBVEZNIK"],
    ["DE", null, "EU_NEOBVEZNIK"],
    ["BA", null, "TRECA_ZEMLJA"],
    ["CH", "CHE-123", "TRECA_ZEMLJA"],
    ["GB", null, "TRECA_ZEMLJA"],
  ])("%s, PDV %s → %s", (d, p, s) => expect(izvedeniPdvStatus(d, p)).toBe(s));

  it("ručni status ima prednost; nepoznati se ignorira", () => {
    expect(pdvStatus("DE", "DE123456789", "EU_NEOBVEZNIK")).toBe("EU_NEOBVEZNIK");
    expect(pdvStatus("DE", "DE123456789", "SVEMIRSKI")).toBe("EU_OBVEZNIK");
  });
});

describe("eRačun adresa", () => {
  it.each([
    ["69435151530", "9934:69435151530"],
    ["9934:69435151530", "9934:69435151530"],
    [" 0088:1234567890123 ", "0088:1234567890123"],
  ])("„%s“ → %s", (u, v) => expect(procitajEracunAdresu(u)).toEqual({ ok: true, vrijednost: v }));

  it.each(["", "69435151531", "9934:12345678901", "OIB", "99:x"])("„%s“ → greška", (u) => expect(procitajEracunAdresu(u).ok).toBe(false));
});

it("poštanski broj u Hrvatskoj", () => {
  expect(jePostanskiBrojHr("10000")).toBe(true);
  expect(jePostanskiBrojHr("21000")).toBe(true);
  expect(jePostanskiBrojHr("00000")).toBe(false);
  expect(jePostanskiBrojHr("1000")).toBe(false);
});
