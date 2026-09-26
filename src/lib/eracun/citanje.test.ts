import { describe, expect, it } from "vitest";
import { procitajUbl } from "./citanje";

const racun = (tijelo: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>R-1</cbc:ID>
  ${tijelo}
</Invoice>`;
const iznosi = `<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">25.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="EUR">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">125.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">25.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

describe("čitanje ulaznog eRačuna", () => {
  it("ukupno je iznos s PDV-om (ne iznos za platiti nakon predujma)", () => {
    expect(procitajUbl(racun(`<cbc:IssueDate>2026-09-01</cbc:IssueDate>${iznosi}`))).toMatchObject({
      datum: "2026-09-01",
      osnovica: 10000,
      pdv: 2500,
      ukupno: 12500,
    });
  });

  it.each(["2026-13-01", "2026-02-30", "1.9.2026"])("nepostojeći datum %s je greška", (d) => {
    expect(() => procitajUbl(racun(`<cbc:IssueDate>${d}</cbc:IssueDate>${iznosi}`))).toThrow("datum");
  });

  it("nedostaju ili su neispravni iznosi → greška, nikad 0 €", () => {
    expect(() => procitajUbl(racun(`<cbc:IssueDate>2026-09-01</cbc:IssueDate>`))).toThrow("ukupne iznose");
    expect(() => procitajUbl(racun(`<cbc:IssueDate>2026-09-01</cbc:IssueDate>${iznosi.replace(">100.00<", ">1,000.00<")}`))).toThrow(
      "Neispravan iznos",
    );
  });

  it("neispravan XML → greška", () => {
    expect(() => procitajUbl("<Invoice>")).toThrow();
    expect(() => procitajUbl("<Nesto/>")).toThrow("nije UBL");
  });
});
