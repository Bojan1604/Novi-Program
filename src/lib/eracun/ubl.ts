/**
 * eRačun: UBL 2.1 prema HR CIUS 2025 (EN 16931 + hrvatsko proširenje) — korak 2.11.
 * Račun i račun za predujam idu kao Invoice, odobrenje i storno kao CreditNote (iznosi pozitivni).
 * Oznake procesa (ProfileID) i proširenja MORA potvrditi knjigovođa / informacijski posrednik.
 */

export const CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.hr:cius-2025:1.0#conformant#urn:mfin.gov.hr:ext-2025:1.0";

export type StrankaUbl = {
  naziv: string;
  oib: string | null;
  pdvBroj: string | null;
  adresa: string | null;
  postanskiBroj: string | null;
  mjesto: string | null;
  drzava: string;
  email?: string | null;
};

export type StavkaUbl = {
  naziv: string;
  opis: string | null;
  kpd: string | null;
  jedinica: string;
  /** tisućinke */
  kolicina: number;
  /** centi, bez PDV-a */
  cijena: number;
  /** iznos stavke nakon popusta (centi) */
  iznos: number;
  ublKod: string;
  stopa: number;
};

export type KategorijaUbl = { ublKod: string; stopa: number; osnovica: number; pdv: number; vatex: string | null; tekst: string | null };

export type RacunUbl = {
  vrsta: "RACUN" | "PREDUJAM" | "ODOBRENJE" | "STORNO";
  broj: string;
  datum: string;
  /** HH:mm:ss po Zagrebu */
  vrijeme: string;
  dospijece: string | null;
  prodavatelj: StrankaUbl & { uSustavuPdv: boolean; iban: string | null };
  operater: { ime: string; oib: string };
  kupac: StrankaUbl;
  izvorni: { broj: string; datum: string } | null;
  nacinPlacanja: string;
  pozivNaBroj: string | null;
  napomene: string[];
  stavke: StavkaUbl[];
  poKategoriji: KategorijaUbl[];
  osnovica: number;
  pdv: number;
  ukupno: number;
  pdf: { naziv: string; base64: string } | null;
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const el = (ime: string, sadrzaj: string | null | undefined, atr = "") =>
  sadrzaj === null || sadrzaj === undefined || sadrzaj === "" ? "" : `<${ime}${atr}>${sadrzaj}</${ime}>`;
const tx = (ime: string, t: string | null | undefined, atr = "") => el(ime, t === null || t === undefined ? t : esc(t), atr);

/** Iznos s dvije decimale („-12.50“). */
export function iznosUbl(centi: number): string {
  const a = Math.abs(centi);
  return `${centi < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** Količina iz tisućinki („2.5“, „1“). */
export function kolicinaUbl(t: number): string {
  const a = Math.abs(t);
  const dec = String(a % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${t < 0 ? "-" : ""}${Math.floor(a / 1000)}${dec ? `.${dec}` : ""}`;
}

/** Jedinica mjere → UN/ECE preporuka 20. */
export function jedinicaUbl(j: string): string {
  const k = j.trim().toLowerCase().replace(/\.$/, "");
  const m: Record<string, string> = {
    kom: "H87",
    komad: "H87",
    h: "HUR",
    sat: "HUR",
    sati: "HUR",
    min: "MIN",
    dan: "DAY",
    mj: "MON",
    mjesec: "MON",
    god: "ANN",
    kg: "KGM",
    g: "GRM",
    m: "MTR",
    km: "KMT",
    l: "LTR",
    m2: "MTK",
    pak: "PK",
    set: "SET",
    paušal: "LS",
  };
  return m[k] ?? "C62";
}

const NACIN_PLACANJA_UBL: Record<string, string> = { T: "30", G: "10", K: "48", O: "1" };

/** Oznaka poslovnog procesa (HR CIUS): P3 račun bez narudžbe, P4 predujam, P9 odobrenje / storno. */
export function procesUbl(vrsta: RacunUbl["vrsta"]): string {
  return vrsta === "PREDUJAM" ? "P4" : vrsta === "RACUN" ? "P3" : "P9";
}

function stranka(s: StrankaUbl, pdv: boolean): string {
  const oib = s.oib ? `<cbc:EndpointID schemeID="9934">${esc(s.oib)}</cbc:EndpointID>` : "";
  const pdvBroj = s.pdvBroj ?? (s.oib && s.drzava === "HR" ? `HR${s.oib}` : null);
  return (
    `<cac:Party>${oib}` +
    `<cac:PartyName>${tx("cbc:Name", s.naziv)}</cac:PartyName>` +
    `<cac:PostalAddress>${tx("cbc:StreetName", s.adresa)}${tx("cbc:CityName", s.mjesto)}${tx("cbc:PostalZone", s.postanskiBroj)}<cac:Country><cbc:IdentificationCode>${esc(s.drzava)}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>` +
    (pdv && pdvBroj
      ? `<cac:PartyTaxScheme>${tx("cbc:CompanyID", pdvBroj)}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : "") +
    `<cac:PartyLegalEntity>${tx("cbc:RegistrationName", s.naziv)}${tx("cbc:CompanyID", s.oib)}</cac:PartyLegalEntity>` +
    (s.email ? `<cac:Contact>${tx("cbc:ElectronicMail", s.email)}</cac:Contact>` : "") +
    `</cac:Party>`
  );
}

function kategorija(ublKod: string, stopa: number, oslobodjenje?: { vatex: string | null; tekst: string | null }) {
  return (
    // BR-O-05: kategorija „nije predmet PDV-a“ nema stopu
    `<cbc:ID>${ublKod}</cbc:ID>${ublKod === "O" ? "" : `<cbc:Percent>${(stopa / 100).toFixed(2)}</cbc:Percent>`}` +
    (oslobodjenje ? `${tx("cbc:TaxExemptionReasonCode", oslobodjenje.vatex)}${tx("cbc:TaxExemptionReason", oslobodjenje.tekst)}` : "") +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`
  );
}

/** UBL XML računa. Za odobrenje i storno (CreditNote) predznaci iznosa i količina se okreću. */
export function ublXml(r: RacunUbl): string {
  const odobrenje = r.vrsta === "ODOBRENJE" || r.vrsta === "STORNO";
  const zn = odobrenje ? -1 : 1;
  const korijen = odobrenje ? "CreditNote" : "Invoice";
  const eur = ' currencyID="EUR"';
  const iz = (c: number) => iznosUbl(zn * c);
  const placanje =
    `<cac:PaymentMeans><cbc:PaymentMeansCode>${NACIN_PLACANJA_UBL[r.nacinPlacanja] ?? "1"}</cbc:PaymentMeansCode>` +
    (odobrenje && r.dospijece ? `<cbc:PaymentDueDate>${r.dospijece}</cbc:PaymentDueDate>` : "") +
    (r.nacinPlacanja === "T" && r.pozivNaBroj ? tx("cbc:PaymentID", r.pozivNaBroj) : "") +
    (r.nacinPlacanja === "T" && r.prodavatelj.iban
      ? `<cac:PayeeFinancialAccount>${tx("cbc:ID", r.prodavatelj.iban)}</cac:PayeeFinancialAccount>`
      : "") +
    `</cac:PaymentMeans>`;
  const porez =
    `<cac:TaxTotal><cbc:TaxAmount${eur}>${iz(r.pdv)}</cbc:TaxAmount>` +
    r.poKategoriji
      .map(
        (k) =>
          `<cac:TaxSubtotal><cbc:TaxableAmount${eur}>${iz(k.osnovica)}</cbc:TaxableAmount><cbc:TaxAmount${eur}>${iz(k.pdv)}</cbc:TaxAmount>` +
          `<cac:TaxCategory>${kategorija(k.ublKod, k.stopa, k.ublKod === "S" || k.ublKod === "Z" ? undefined : { vatex: k.vatex, tekst: k.tekst })}</cac:TaxCategory></cac:TaxSubtotal>`,
      )
      .join("") +
    `</cac:TaxTotal>`;
  const zbroj = r.stavke.reduce((a, s) => a + s.iznos, 0);
  const ukupno =
    `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount${eur}>${iz(zbroj)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxExclusiveAmount${eur}>${iz(r.osnovica)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount${eur}>${iz(r.ukupno)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount${eur}>${iz(r.ukupno)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`;
  const redak = odobrenje ? "CreditNoteLine" : "InvoiceLine";
  const kol = odobrenje ? "CreditedQuantity" : "InvoicedQuantity";
  const stavke = r.stavke
    .map((s, i) => {
      // cijena u UBL-u ne smije biti negativna: negativna stavka (odbitak predujma) ide kao negativna količina
      let kolicina = zn * s.kolicina;
      let cijena = s.cijena;
      if (cijena < 0) {
        cijena = -cijena;
        kolicina = -kolicina;
      }
      const bruto = Math.round((kolicina * cijena) / 1000);
      const iznos = zn * s.iznos;
      const popust = bruto - iznos;
      return (
        `<cac:${redak}><cbc:ID>${i + 1}</cbc:ID><cbc:${kol} unitCode="${jedinicaUbl(s.jedinica)}">${kolicinaUbl(kolicina)}</cbc:${kol}>` +
        `<cbc:LineExtensionAmount${eur}>${iznosUbl(iznos)}</cbc:LineExtensionAmount>` +
        (popust !== 0
          ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode><cbc:AllowanceChargeReason>Popust</cbc:AllowanceChargeReason><cbc:Amount${eur}>${iznosUbl(popust)}</cbc:Amount></cac:AllowanceCharge>`
          : "") +
        `<cac:Item>${tx("cbc:Description", s.opis)}${tx("cbc:Name", s.naziv)}` +
        (s.kpd
          ? `<cac:CommodityClassification><cbc:ItemClassificationCode listID="CG">${esc(s.kpd)}</cbc:ItemClassificationCode></cac:CommodityClassification>`
          : "") +
        `<cac:ClassifiedTaxCategory>${kategorija(s.ublKod, s.stopa)}</cac:ClassifiedTaxCategory></cac:Item>` +
        `<cac:Price><cbc:PriceAmount${eur}>${iznosUbl(cijena)}</cbc:PriceAmount></cac:Price></cac:${redak}>`
      );
    })
    .join("");
  const ns =
    `xmlns="urn:oasis:names:specification:ubl:schema:xsd:${korijen}-2" ` +
    `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
    `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<${korijen} ${ns}>` +
    `<cbc:CustomizationID>${CUSTOMIZATION_ID}</cbc:CustomizationID><cbc:ProfileID>${procesUbl(r.vrsta)}</cbc:ProfileID>` +
    `${tx("cbc:ID", r.broj)}<cbc:IssueDate>${r.datum}</cbc:IssueDate><cbc:IssueTime>${r.vrijeme}</cbc:IssueTime>` +
    (!odobrenje && r.dospijece ? `<cbc:DueDate>${r.dospijece}</cbc:DueDate>` : "") +
    `<cbc:${korijen}TypeCode>${odobrenje ? "381" : r.vrsta === "PREDUJAM" ? "386" : "380"}</cbc:${korijen}TypeCode>` +
    r.napomene.map((n) => tx("cbc:Note", n)).join("") +
    `<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>` +
    (r.izvorni
      ? `<cac:BillingReference><cac:InvoiceDocumentReference>${tx("cbc:ID", r.izvorni.broj)}<cbc:IssueDate>${r.izvorni.datum}</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>`
      : "") +
    (r.pdf
      ? `<cac:AdditionalDocumentReference>${tx("cbc:ID", r.broj)}<cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="${esc(r.pdf.naziv)}">${r.pdf.base64}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`
      : "") +
    `<cac:AccountingSupplierParty>${stranka(r.prodavatelj, r.prodavatelj.uSustavuPdv)}` +
    `<cac:SellerContact>${tx("cbc:ID", r.operater.oib)}${tx("cbc:Name", r.operater.ime)}</cac:SellerContact></cac:AccountingSupplierParty>` +
    `<cac:AccountingCustomerParty>${stranka(r.kupac, true)}</cac:AccountingCustomerParty>` +
    placanje +
    porez +
    ukupno +
    stavke +
    `</${korijen}>`
  );
}
