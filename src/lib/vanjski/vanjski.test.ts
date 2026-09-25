import { afterEach, describe, expect, it, vi } from "vitest";
import { dohvatiJson, GreskaVanjska } from "./dohvat";
import { procitajSudreg } from "./sudreg";
import { procitajVies, provjeriVies, razloziAdresu } from "./vies";

afterEach(() => vi.unstubAllGlobals());

describe("VIES", () => {
  it("valjan broj s nazivom i adresom", () => {
    expect(procitajVies({ isValid: true, name: "PRIMJER D.O.O.", address: "ILICA 1\n10000 ZAGREB", userError: "VALID" })).toEqual({
      valjan: true,
      podaci: { naziv: "PRIMJER D.O.O.", adresa: "ILICA 1", postanskiBroj: "10000", mjesto: "Zagreb" },
    });
  });

  it("valjan broj bez podataka (neke države ne daju naziv)", () => {
    expect(procitajVies({ isValid: true, name: "---", address: "---" }).podaci).toEqual({
      naziv: null,
      adresa: null,
      postanskiBroj: null,
      mjesto: null,
    });
  });

  it("nevaljan broj", () => {
    expect(procitajVies({ isValid: false, userError: "INVALID" }).valjan).toBe(false);
  });

  it("servis države nedostupan → ljudska poruka", () => {
    expect(() => procitajVies({ isValid: false, userError: "MS_UNAVAILABLE" })).toThrow(GreskaVanjska);
  });

  it("adresa s više redaka i složenim mjestom", () => {
    expect(razloziAdresu("ULICA GRADA VUKOVARA 271\nZGRADA B\n10000 ZAGREB-NOVI ZAGREB")).toEqual({
      adresa: "ULICA GRADA VUKOVARA 271, ZGRADA B",
      postanskiBroj: "10000",
      mjesto: "Zagreb-Novi Zagreb",
    });
  });

  it("bez mreže: poruka umjesto tehničke greške", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(provjeriVies("DE123456789")).rejects.toThrow(/nije dostupan.*ručno/);
  });

  it("istek vremena: poruka", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "TimeoutError" })));
    await expect(dohvatiJson("https://x", { naziv: "Registar" })).rejects.toThrow("Registar ne odgovara");
  });

  it("greška poslužitelja: poruka s kodom", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 503 })));
    await expect(dohvatiJson("https://x", { naziv: "Registar" })).rejects.toThrow("(503)");
  });
});

describe("sudski registar", () => {
  it("tolerantno čita detalje subjekta", () => {
    expect(
      procitajSudreg({
        oib: "69435151530",
        tvrtka: { ime: "PRIMJER d.o.o. za trgovinu" },
        sjediste: { ulica: "Ilica", kucni_broj: 12, kucni_podbroj: "a", naziv_naselja: "Zagreb", postanski_broj: "10000" },
      }),
    ).toEqual({ naziv: "PRIMJER d.o.o. za trgovinu", adresa: "Ilica 12a", postanskiBroj: "10000", mjesto: "Zagreb" });
  });

  it("nepostojeći subjekt", () => {
    expect(procitajSudreg(null)).toBeNull();
  });
});
