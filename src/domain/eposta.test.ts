import { describe, expect, it } from "vitest";
import { mailto, predlozak, procitajPrimatelje, VRSTE_PORUKA, vrstaPoruke, type PodaciPoruke, type VrstaPoruke } from "./eposta";

const p: PodaciPoruke = {
  firma: "Demo d.o.o.",
  kupac: "Kupac d.o.o.",
  broj: "12/PP1/1",
  iznos: "1.250,00 €",
  datum: "25.09.2026.",
  dospijece: "10.10.2026.",
  vrijediDo: "10.10.2026.",
  iban: "HR1210010051863000160",
  pozivNaBroj: "12-2026",
  zaRacun: "11/PP1/1",
};

describe("predlošci e-pošte", () => {
  const OCEKIVANO: Record<VrstaPoruke, { predmet: string; sadrzi: string[] }> = {
    PONUDA: { predmet: "Ponuda 12/PP1/1 — Demo d.o.o.", sadrzi: ["ponudu 12/PP1/1 u iznosu 1.250,00 €", "vrijedi do 10.10.2026."] },
    PREDRACUN: { predmet: "Predračun 12/PP1/1 — Demo d.o.o.", sadrzi: ["rokom plaćanja 10.10.2026.", "poziv na broj 12-2026"] },
    RACUN: {
      predmet: "Račun 12/PP1/1 — Demo d.o.o.",
      sadrzi: ["račun 12/PP1/1 od 25.09.2026. u iznosu 1.250,00 €", "dospijećem 10.10.2026.", "IBAN HR1210010051863000160"],
    },
    PLACEN: { predmet: "Račun 12/PP1/1 je plaćen — Demo d.o.o.", sadrzi: ["zahvaljujemo na uplati", "u cijelosti plaćen"] },
    STORNO: { predmet: "Storno računa 11/PP1/1 (12/PP1/1) — Demo d.o.o.", sadrzi: ["račun 11/PP1/1 storniran dokumentom 12/PP1/1"] },
    ODOBRENJE: { predmet: "Odobrenje 12/PP1/1 za račun 11/PP1/1 — Demo d.o.o.", sadrzi: ["odobrenje 12/PP1/1 u iznosu 1.250,00 €"] },
    PREDUJAM: { predmet: "Račun za predujam 12/PP1/1 — Demo d.o.o.", sadrzi: ["odbijen na konačnom računu", "poziv na broj 12-2026"] },
  };
  for (const v of Object.keys(VRSTE_PORUKA) as VrstaPoruke[]) {
    it(VRSTE_PORUKA[v], () => {
      const r = predlozak(v, p);
      expect(r.predmet).toBe(OCEKIVANO[v].predmet);
      for (const t of OCEKIVANO[v].sadrzi) expect(r.tijelo).toContain(t);
      expect(r.tijelo).toMatch(/^Poštovani,/);
      expect(r.tijelo).toMatch(/Demo d\.o\.o\.$/);
    });
  }
  it("bez IBAN-a nema retka o plaćanju", () => {
    expect(predlozak("RACUN", { ...p, iban: null }).tijelo).not.toContain("IBAN");
  });
  it("vrsta poruke po dokumentu", () => {
    expect(vrstaPoruke("RACUN", true)).toBe("PLACEN");
    expect(vrstaPoruke("RACUN", false)).toBe("RACUN");
    expect(vrstaPoruke("ODOBRENJE", false)).toBe("ODOBRENJE");
  });
});

describe("primatelji i mailto", () => {
  it("jedna ili više adresa, provjera", () => {
    expect(procitajPrimatelje("Ana@Firma.hr; racuni@firma.hr, ana@firma.hr")).toEqual({ ok: true, vrijednost: ["ana@firma.hr", "racuni@firma.hr"] });
    expect(procitajPrimatelje("")).toEqual({ ok: false, greska: "Upišite e-poštu primatelja." });
    expect(procitajPrimatelje("ana@firma")).toEqual({ ok: false, greska: "E-pošta „ana@firma“ nije ispravna." });
  });
  it("mailto kodira predmet i tekst", () => {
    expect(mailto(["a@b.hr"], "Račun 1/PP1/1", "Red 1\nRed 2")).toBe("mailto:a%40b.hr?subject=Ra%C4%8Dun%201%2FPP1%2F1&body=Red%201%0ARed%202");
  });
});
