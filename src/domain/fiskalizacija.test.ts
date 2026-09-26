import { describe, expect, it } from "vitest";
import { datumVrijemeCis, iznosCis, qrProvjere, sljedeciPokusaj, trebaFiskalizaciju, ulazZki } from "./fiskalizacija";

describe("fiskalizacija", () => {
  it("kad se fiskalizira", () => {
    expect(trebaFiskalizaciju({ vrsta: "RACUN", nacinPlacanja: "G", kupacImaOib: true })).toBe(true);
    expect(trebaFiskalizaciju({ vrsta: "RACUN", nacinPlacanja: "K", kupacImaOib: true })).toBe(true);
    expect(trebaFiskalizaciju({ vrsta: "RACUN", nacinPlacanja: "T", kupacImaOib: true })).toBe(false);
    expect(trebaFiskalizaciju({ vrsta: "RACUN", nacinPlacanja: "T", kupacImaOib: false })).toBe(true);
    expect(trebaFiskalizaciju({ vrsta: "STORNO", nacinPlacanja: "G", kupacImaOib: true })).toBe(true);
    expect(trebaFiskalizaciju({ vrsta: "PONUDA", nacinPlacanja: "G", kupacImaOib: false })).toBe(false);
  });
  it("datum, vrijeme i iznos u obliku za CIS (Zagreb, ljetno i zimsko vrijeme)", () => {
    expect(datumVrijemeCis(new Date("2026-09-25T10:05:09Z"))).toBe("25.09.2026T12:05:09");
    expect(datumVrijemeCis(new Date("2026-01-02T23:30:00Z"))).toBe("03.01.2027T00:30:00".replace("2027", "2026"));
    expect(iznosCis(12500)).toBe("125.00");
    expect(iznosCis(5)).toBe("0.05");
    expect(iznosCis(-12505)).toBe("-125.05");
  });
  it("ulaz za ZKI po specifikaciji", () => {
    expect(ulazZki({ oib: "69435151530", vrijeme: new Date("2026-09-25T10:05:09Z"), redni: 12, prostor: "PP1", uredaj: "1", ukupno: 12500 })).toBe(
      "6943515153025.09.2026 12:05:0912PP11125.00",
    );
  });
  it("QR za provjeru računa", () => {
    const t = new Date("2026-09-25T10:05:09Z");
    expect(qrProvjere({ jir: "a1b2", zki: "z", vrijeme: t, ukupno: 12500 })).toBe("https://porezna.gov.hr/rn?jir=a1b2&datv=20260925_1205&izn=12500");
    expect(qrProvjere({ jir: null, zki: "abc", vrijeme: t, ukupno: -300 })).toBe("https://porezna.gov.hr/rn?zki=abc&datv=20260925_1205&izn=300");
  });
  it("naknadna dostava", () => {
    const s = new Date("2026-09-25T10:00:00Z");
    expect(sljedeciPokusaj(0, s).toISOString()).toBe("2026-09-25T10:01:00.000Z");
    expect(sljedeciPokusaj(7, s).toISOString()).toBe("2026-09-25T11:00:00.000Z");
  });
});
