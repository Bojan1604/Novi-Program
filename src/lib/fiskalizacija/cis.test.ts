import { createVerify } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { SignedXml } from "xml-crypto";
import { demoCertifikat, demoP12, ucitajP12 } from "./certifikat";
import { izracunajZki, potpisi, procitajOdgovor, racunZahtjev } from "./cis";

describe("fiskalizacija — potpisi", () => {
  const c = demoCertifikat();
  it("ZKI: 32 heks znaka, isti ulaz isti ZKI, potpis provjerljiv javnim ključem", () => {
    const z = izracunajZki("6943515153025.09.2026 12:05:0912PP11125.00", c.kljucPem);
    expect(z).toMatch(/^[0-9a-f]{32}$/);
    expect(izracunajZki("6943515153025.09.2026 12:05:0912PP11125.00", c.kljucPem)).toBe(z);
    expect(izracunajZki("drugo", c.kljucPem)).not.toBe(z);
    expect(createVerify("RSA-SHA1").update("x").verify(c.certPem, Buffer.alloc(256))).toBe(false);
  });
  it("učitavanje .p12 s lozinkom; kriva lozinka javlja grešku", () => {
    const p = ucitajP12(demoP12("tajna"), "tajna");
    expect(p.naziv).toBe("DEMO FISKAL ERP-WMS");
    expect(() => ucitajP12(demoP12("tajna"), "kriva")).toThrow();
  });
  it("RacunZahtjev potpisan i potpis se provjerava", () => {
    const xml = potpisi(
      racunZahtjev(
        {
          oib: "69435151530",
          uSustavuPdv: true,
          datumVrijeme: "25.09.2026T12:05:09",
          redni: 12,
          prostor: "PP1",
          uredaj: "1",
          pdv: [{ stopa: "25.00", osnovica: "100.00", iznos: "25.00" }],
          ukupno: "125.00",
          nacinPlacanja: "G",
          oibOperatera: "69435151530",
          zki: "a".repeat(32),
          naknadnaDostava: false,
        },
        "11111111-1111-4111-8111-111111111111",
      ),
      c,
    );
    expect(xml).toContain("<tns:IznosUkupno>125.00</tns:IznosUkupno>");
    expect(xml).toContain("rsa-sha1");
    const dok = new DOMParser().parseFromString(xml, "text/xml");
    const potpis = dok.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0]!;
    const v = new SignedXml({ publicCert: c.certPem });
    v.loadSignature(potpis.toString());
    expect(v.checkSignature(xml)).toBe(true);
    expect(v.checkSignature(xml.replace("125.00</tns:IznosUkupno>", "1.00</tns:IznosUkupno>"))).toBe(false);
  });
  it("odgovor CIS-a: JIR ili greška", () => {
    expect(
      procitajOdgovor(
        '<s:Envelope xmlns:s="x"><s:Body><tns:RacunOdgovor xmlns:tns="y"><tns:Jir>abc-123</tns:Jir></tns:RacunOdgovor></s:Body></s:Envelope>',
      ),
    ).toEqual({ jir: "abc-123" });
    expect(
      procitajOdgovor(
        '<a xmlns:t="y"><t:Greske><t:Greska><t:SifraGreske>s004</t:SifraGreske><t:PorukaGreske>Neispravan potpis</t:PorukaGreske></t:Greska></t:Greske></a>',
      ),
    ).toEqual({ greska: "s004: Neispravan potpis" });
  });
});
