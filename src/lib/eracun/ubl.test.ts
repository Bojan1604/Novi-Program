import { describe, expect, it } from "vitest";
import { provjeriUbl } from "./provjera";
import { iznosUbl, jedinicaUbl, kolicinaUbl, ublXml, type RacunUbl } from "./ubl";

const osnova = (x: Partial<RacunUbl> = {}): RacunUbl => ({
  vrsta: "RACUN",
  broj: "7/PP1/1",
  datum: "2026-09-25",
  vrijeme: "12:00:00",
  dospijece: "2026-10-10",
  prodavatelj: {
    naziv: "Firma & Co d.o.o.",
    oib: "94577403194",
    pdvBroj: null,
    adresa: "Ilica 1",
    postanskiBroj: "10000",
    mjesto: "Zagreb",
    drzava: "HR",
    uSustavuPdv: true,
    iban: "HR1210010051863000160",
  },
  operater: { ime: "Ana", oib: "69435151530" },
  kupac: { naziv: "Kupac d.o.o.", oib: "69435151530", pdvBroj: null, adresa: "Vukovarska 2", postanskiBroj: "21000", mjesto: "Split", drzava: "HR" },
  izvorni: null,
  nacinPlacanja: "T",
  pozivNaBroj: "HR00 7-2026",
  napomene: [],
  stavke: [
    {
      naziv: "Dell Latitude",
      opis: "S/N: A1, A2",
      kpd: "26.20.11",
      jedinica: "kom",
      kolicina: 2000,
      cijena: 100000,
      iznos: 180000,
      ublKod: "S",
      stopa: 2500,
    },
    { naziv: "Dostava", opis: null, kpd: "49.41.19", jedinica: "usluga", kolicina: 1000, cijena: 1000, iznos: 1000, ublKod: "S", stopa: 1300 },
  ],
  poKategoriji: [
    { ublKod: "S", stopa: 2500, osnovica: 180000, pdv: 45000, vatex: null, tekst: null },
    { ublKod: "S", stopa: 1300, osnovica: 1000, pdv: 130, vatex: null, tekst: null },
  ],
  osnovica: 181000,
  pdv: 45130,
  ukupno: 226130,
  pdf: null,
  ...x,
});

describe("oblikovanje", () => {
  it("iznosi, količine, jedinice", () => {
    expect(iznosUbl(12345)).toBe("123.45");
    expect(iznosUbl(-5)).toBe("-0.05");
    expect(kolicinaUbl(2500)).toBe("2.5");
    expect(kolicinaUbl(1000)).toBe("1");
    expect(kolicinaUbl(-1250)).toBe("-1.25");
    expect(jedinicaUbl("kom")).toBe("H87");
    expect(jedinicaUbl("h")).toBe("HUR");
    expect(jedinicaUbl("nešto")).toBe("C62");
  });
});

describe("UBL eRačun (HR CIUS) i provjera", () => {
  it("račun s popustom stavke, dvije stope, IBAN i poziv na broj: prolazi provjeru", () => {
    const xml = ublXml(osnova());
    expect(provjeriUbl(xml)).toEqual([]);
    expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
    expect(xml).toContain('<cbc:EndpointID schemeID="9934">94577403194</cbc:EndpointID>');
    expect(xml).toContain('<cbc:ItemClassificationCode listID="CG">26.20.11</cbc:ItemClassificationCode>');
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="H87">2</cbc:InvoicedQuantity>');
    expect(xml).toContain('<cbc:Amount currencyID="EUR">200.00</cbc:Amount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">2261.30</cbc:PayableAmount>');
    expect(xml).toContain("Firma &amp; Co d.o.o.");
    expect(xml).toContain("<cbc:CompanyID>HR94577403194</cbc:CompanyID>");
  });

  it("račun za predujam (386) i konačni račun s odbitkom predujma (negativna količina, cijena pozitivna)", () => {
    expect(provjeriUbl(ublXml(osnova({ vrsta: "PREDUJAM" })))).toEqual([]);
    const konacni = osnova({
      stavke: [
        osnova().stavke[0]!,
        {
          naziv: "Predujam 1/PP1/1",
          opis: null,
          kpd: "26.20.11",
          jedinica: "kom",
          kolicina: 1000,
          cijena: -50000,
          iznos: -50000,
          ublKod: "S",
          stopa: 2500,
        },
      ],
      poKategoriji: [{ ublKod: "S", stopa: 2500, osnovica: 130000, pdv: 32500, vatex: null, tekst: null }],
      osnovica: 130000,
      pdv: 32500,
      ukupno: 162500,
    });
    const xml = ublXml(konacni);
    expect(provjeriUbl(xml)).toEqual([]);
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="H87">-1</cbc:InvoicedQuantity>');
    expect(xml).not.toMatch(/<cbc:PriceAmount[^>]*>-/);
  });

  it("odobrenje i storno kao CreditNote s pozitivnim iznosima i vezom na izvorni račun", () => {
    const neg = osnova();
    const storno = osnova({
      vrsta: "STORNO",
      broj: "8/PP1/1",
      izvorni: { broj: "7/PP1/1", datum: "2026-09-25" },
      stavke: neg.stavke.map((s) => ({ ...s, kolicina: -s.kolicina, iznos: -s.iznos })),
      poKategoriji: neg.poKategoriji.map((k) => ({ ...k, osnovica: -k.osnovica, pdv: -k.pdv })),
      osnovica: -neg.osnovica,
      pdv: -neg.pdv,
      ukupno: -neg.ukupno,
    });
    const xml = ublXml(storno);
    expect(provjeriUbl(xml)).toEqual([]);
    expect(xml).toContain("<CreditNote ");
    expect(xml).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(xml).toContain('<cbc:CreditedQuantity unitCode="H87">2</cbc:CreditedQuantity>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">2261.30</cbc:PayableAmount>');
    expect(xml).toContain("<cbc:ProfileID>P9</cbc:ProfileID>");
    expect(provjeriUbl(ublXml({ ...storno, vrsta: "ODOBRENJE" }))).toEqual([]);
    expect(provjeriUbl(ublXml({ ...storno, izvorni: null }))).toEqual(["HR-BR-18: odobrenje mora navesti izvorni račun."]);
  });

  it("firma izvan sustava PDV-a: kategorija O s razlogom, bez PDV broja prodavatelja", () => {
    const xml = ublXml(
      osnova({
        prodavatelj: { ...osnova().prodavatelj, uSustavuPdv: false },
        stavke: osnova().stavke.map((s) => ({ ...s, ublKod: "O", stopa: 0 })),
        poKategoriji: [{ ublKod: "O", stopa: 0, osnovica: 181000, pdv: 0, vatex: null, tekst: "Obveznik nije u sustavu PDV-a." }],
        pdv: 0,
        ukupno: 181000,
      }),
    );
    expect(provjeriUbl(xml)).toEqual([]);
    expect(xml).not.toContain("HR94577403194");
  });

  it("provjera hvata greške: bez KPD-a, krivi zbroj, krivi PDV, krivi OIB, bez IBAN-a, bez razloga oslobođenja", () => {
    const r = osnova();
    expect(provjeriUbl(ublXml({ ...r, stavke: [{ ...r.stavke[0]!, kpd: null }, r.stavke[1]!] }))).toContain(
      "HR-BR-25: stavka 1 nema ispravnu KPD šifru.",
    );
    expect(provjeriUbl(ublXml({ ...r, osnovica: 181001 }))).toEqual(expect.arrayContaining(["BR-CO-13: iznos bez PDV-a ne odgovara zbroju stavki."]));
    expect(provjeriUbl(ublXml({ ...r, poKategoriji: [{ ...r.poKategoriji[0]!, pdv: 45100 }, r.poKategoriji[1]!] }))).toEqual(
      expect.arrayContaining(["BR-S-09: PDV kategorije S 25 % nije točno izračunat."]),
    );
    expect(provjeriUbl(ublXml({ ...r, kupac: { ...r.kupac, oib: "12345678901" } }))).toContain("HR-BR-10: OIB kupca nije ispravan.");
    expect(provjeriUbl(ublXml({ ...r, prodavatelj: { ...r.prodavatelj, iban: null } }))).toContain("BR-50: za plaćanje na račun nedostaje IBAN.");
    expect(
      provjeriUbl(
        ublXml({
          ...r,
          stavke: r.stavke.map((s) => ({ ...s, ublKod: "AE", stopa: 0 })),
          poKategoriji: [{ ublKod: "AE", stopa: 0, osnovica: 181000, pdv: 0, vatex: null, tekst: null }],
          pdv: 0,
          ukupno: 181000,
        }),
      ),
    ).toContain("BR-AE-10: kategorija AE mora imati razlog oslobođenja.");
    expect(provjeriUbl("<Invoice")).toHaveLength(1);
    expect(provjeriUbl("<Narudzba/>")).toEqual(["XML: korijen nije Invoice ni CreditNote."]);
  });

  it("PDF u prilogu (base64)", () => {
    const xml = ublXml(osnova({ pdf: { naziv: "Racun-7-PP1-1.pdf", base64: Buffer.from("%PDF-1.4").toString("base64") } }));
    expect(xml).toContain('mimeCode="application/pdf" filename="Racun-7-PP1-1.pdf">JVBERi0xLjQ=</cbc:EmbeddedDocumentBinaryObject>');
    expect(provjeriUbl(xml)).toEqual([]);
  });
});
