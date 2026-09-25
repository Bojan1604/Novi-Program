import { describe, expect, it } from "vitest";
import { adresaTestneBaze } from "./testna-baza";

describe("adresaTestneBaze", () => {
  it("vraća adresu baze s „test“ u imenu", () => {
    const url = "postgresql://erp:erp@localhost:5432/erp_wms_test";
    expect(adresaTestneBaze({ DATABASE_URL_TEST: url })).toBe(url);
  });

  it("odbija pravu bazu", () => {
    expect(() => adresaTestneBaze({ DATABASE_URL_TEST: "postgresql://erp:erp@localhost:5432/erp_wms" })).toThrow(/test/);
  });

  it("ne gleda korisnika ni poslužitelj, samo ime baze", () => {
    expect(() => adresaTestneBaze({ DATABASE_URL_TEST: "postgresql://test:test@test-host:5432/erp_wms" })).toThrow();
  });

  it("javlja kad adresa nije postavljena", () => {
    expect(() => adresaTestneBaze({})).toThrow(/DATABASE_URL_TEST/);
  });
});
