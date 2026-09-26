import { DOMParser } from "@xmldom/xmldom";
import { jeOib } from "@/domain/oib";
import { CUSTOMIZATION_ID } from "./ubl";

/**
 * Provjera UBL eRačuna prije slanja: najvažnija pravila EN 16931 (BR-*, BR-CO-*) i HR CIUS (HR-BR-*).
 * Nije zamjena za službeni Schematron (provjerava ga i posrednik), ali hvata greške programa i podataka.
 */
export function provjeriUbl(xml: string): string[] {
  const greske: string[] = [];
  const g = (pravilo: string, poruka: string) => greske.push(`${pravilo}: ${poruka}`);
  let dok: Document;
  try {
    const greskeXml: string[] = [];
    dok = new DOMParser({ onError: (_l: string, m: string) => void greskeXml.push(m) }).parseFromString(xml, "text/xml") as unknown as Document;
    if (greskeXml.length) return [`XML: ${greskeXml[0]}`];
  } catch (e) {
    return [`XML: ${e instanceof Error ? e.message : "neispravan"}`];
  }
  const korijen = dok.documentElement;
  if (!korijen || !["Invoice", "CreditNote"].includes(korijen.localName)) return ["XML: korijen nije Invoice ni CreditNote."];
  const odobrenje = korijen.localName === "CreditNote";

  const djeca = (e: Element, ime: string) =>
    Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === ime);
  const put = (e: Element, ...imena: string[]): Element[] => imena.reduce<Element[]>((sk, ime) => sk.flatMap((x) => djeca(x, ime)), [e]);
  const tekst = (e: Element, ...imena: string[]) => put(e, ...imena)[0]?.textContent?.trim() ?? "";
  const iznos = (e: Element, ...imena: string[]) => {
    const t = tekst(e, ...imena);
    return t === "" ? null : Math.round(Number(t) * 100);
  };

  if (tekst(korijen, "CustomizationID") !== CUSTOMIZATION_ID) g("BR-01", "nedostaje ili je kriva oznaka specifikacije (HR CIUS 2025).");
  if (!/^P([1-9]|1[0-2])$/.test(tekst(korijen, "ProfileID"))) g("HR-BR-34", "oznaka poslovnog procesa mora biti P1–P12.");
  if (!tekst(korijen, "ID")) g("BR-02", "nema broja računa.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tekst(korijen, "IssueDate"))) g("BR-03", "nema datuma izdavanja.");
  if (!/^\d{2}:\d{2}:\d{2}$/.test(tekst(korijen, "IssueTime"))) g("HR-BR-2", "nema vremena izdavanja.");
  const vrsta = tekst(korijen, odobrenje ? "CreditNoteTypeCode" : "InvoiceTypeCode");
  if (!(odobrenje ? ["381"] : ["380", "386"]).includes(vrsta)) g("BR-04", "neispravna vrsta računa.");
  if (tekst(korijen, "DocumentCurrencyCode") !== "EUR") g("BR-05", "valuta mora biti EUR.");
  if (odobrenje && !tekst(korijen, "BillingReference", "InvoiceDocumentReference", "ID")) g("HR-BR-18", "odobrenje mora navesti izvorni račun.");

  const prodavatelj = put(korijen, "AccountingSupplierParty", "Party")[0];
  const kupac = put(korijen, "AccountingCustomerParty", "Party")[0];
  if (!prodavatelj || !tekst(prodavatelj, "PartyLegalEntity", "RegistrationName")) g("BR-06", "nema naziva prodavatelja.");
  if (!kupac || !tekst(kupac, "PartyLegalEntity", "RegistrationName")) g("BR-07", "nema naziva kupca.");
  if (prodavatelj && !tekst(prodavatelj, "PostalAddress", "Country", "IdentificationCode")) g("BR-09", "nema države prodavatelja.");
  if (kupac && !tekst(kupac, "PostalAddress", "Country", "IdentificationCode")) g("BR-11", "nema države kupca.");
  const oibP = prodavatelj ? tekst(prodavatelj, "PartyLegalEntity", "CompanyID") : "";
  if (!jeOib(oibP)) g("HR-BR-9", "OIB prodavatelja nije ispravan.");
  const oibK = kupac ? tekst(kupac, "PartyLegalEntity", "CompanyID") : "";
  if (!jeOib(oibK)) g("HR-BR-10", "OIB kupca nije ispravan.");
  if (prodavatelj && !put(prodavatelj, "EndpointID")[0]) g("BR-62", "nema elektroničke adrese prodavatelja.");
  if (kupac && !put(kupac, "EndpointID")[0]) g("BR-63", "nema elektroničke adrese kupca.");
  const operater = put(korijen, "AccountingSupplierParty", "SellerContact")[0];
  if (!operater || !jeOib(tekst(operater, "ID"))) g("HR-BR-5", "nema ispravnog OIB-a operatera.");

  const placanje = put(korijen, "PaymentMeans")[0];
  if (!placanje || !tekst(placanje, "PaymentMeansCode")) g("BR-49", "nema načina plaćanja.");
  else if (tekst(placanje, "PaymentMeansCode") === "30" && !tekst(placanje, "PayeeFinancialAccount", "ID"))
    g("BR-50", "za plaćanje na račun nedostaje IBAN.");

  const retci = djeca(korijen, odobrenje ? "CreditNoteLine" : "InvoiceLine");
  if (retci.length === 0) g("BR-16", "račun mora imati barem jednu stavku.");
  const poKategoriji = new Map<string, number>();
  let zbrojRedaka = 0;
  for (const r of retci) {
    const id = tekst(r, "ID") || "?";
    const iz = iznos(r, "LineExtensionAmount");
    if (iz === null) {
      g("BR-24", `stavka ${id} nema iznosa.`);
      continue;
    }
    zbrojRedaka += iz;
    if (!tekst(r, "Item", "Name")) g("BR-25", `stavka ${id} nema naziva.`);
    const cijena = iznos(r, "Price", "PriceAmount");
    if (cijena === null) g("BR-26", `stavka ${id} nema cijene.`);
    else if (cijena < 0) g("BR-27", `cijena stavke ${id} ne smije biti negativna.`);
    const kpd = tekst(r, "Item", "CommodityClassification", "ItemClassificationCode");
    if (!/^\d{2}\.\d{2}\.\d{1,2}(\.\d{1,2})?$/.test(kpd)) g("HR-BR-25", `stavka ${id} nema ispravnu KPD šifru.`);
    const kat = put(r, "Item", "ClassifiedTaxCategory")[0];
    if (!kat) {
      g("BR-CO-4", `stavka ${id} nema kategoriju PDV-a.`);
      continue;
    }
    const kljuc = `${tekst(kat, "ID")}|${Number(tekst(kat, "Percent") || "0").toFixed(2)}`;
    poKategoriji.set(kljuc, (poKategoriji.get(kljuc) ?? 0) + iz);
    // BR-LIN: iznos = količina × cijena − popust stavke (±1 cent zbog zaokruživanja)
    const kol = Number(tekst(r, odobrenje ? "CreditedQuantity" : "InvoicedQuantity"));
    const popust = put(r, "AllowanceCharge").reduce(
      (a, x) => a + (tekst(x, "ChargeIndicator") === "false" ? (iznos(x, "Amount") ?? 0) : -(iznos(x, "Amount") ?? 0)),
      0,
    );
    if (cijena !== null && Math.abs(Math.round(kol * cijena) - popust - iz) > 1)
      g("BR-LIN-04", `iznos stavke ${id} ne odgovara količini, cijeni i popustu.`);
  }

  const zbrojevi = put(korijen, "LegalMonetaryTotal")[0];
  if (!zbrojevi) {
    g("BR-12", "nema zbrojeva računa.");
    return greske;
  }
  const linije = iznos(zbrojevi, "LineExtensionAmount");
  const bezPdv = iznos(zbrojevi, "TaxExclusiveAmount");
  const sPdv = iznos(zbrojevi, "TaxInclusiveAmount");
  const zaPlatiti = iznos(zbrojevi, "PayableAmount");
  const placeno = iznos(zbrojevi, "PrepaidAmount") ?? 0;
  if (linije === null || bezPdv === null || sPdv === null || zaPlatiti === null) g("BR-12", "nedostaju zbrojevi računa.");
  if (linije !== zbrojRedaka) g("BR-CO-10", "zbroj stavki ne odgovara iznosu računa.");
  const pdvUkupno = iznos(korijen, "TaxTotal", "TaxAmount") ?? 0;
  if (bezPdv !== null && linije !== null && bezPdv !== linije) g("BR-CO-13", "iznos bez PDV-a ne odgovara zbroju stavki.");
  if (sPdv !== null && bezPdv !== null && sPdv !== bezPdv + pdvUkupno) g("BR-CO-15", "iznos s PDV-om ≠ iznos bez PDV-a + PDV.");
  if (zaPlatiti !== null && sPdv !== null && zaPlatiti !== sPdv - placeno) g("BR-CO-16", "iznos za plaćanje ne odgovara.");

  const podzbrojevi = put(korijen, "TaxTotal", "TaxSubtotal");
  if (podzbrojevi.length === 0) g("BR-CO-18", "nema razrade PDV-a.");
  let zbrojPdv = 0;
  for (const p of podzbrojevi) {
    const kat = put(p, "TaxCategory")[0];
    const kod = kat ? tekst(kat, "ID") : "";
    const stopa = Number(kat ? tekst(kat, "Percent") || "0" : "0");
    const osn = iznos(p, "TaxableAmount") ?? 0;
    const pdv = iznos(p, "TaxAmount") ?? 0;
    zbrojPdv += pdv;
    const kljuc = `${kod}|${stopa.toFixed(2)}`;
    if ((poKategoriji.get(kljuc) ?? 0) !== osn) g(`BR-${kod}-08`, `osnovica kategorije ${kod} ${stopa} % ne odgovara stavkama.`);
    poKategoriji.delete(kljuc);
    if (Math.abs(Math.round((osn * stopa) / 100) - pdv) > 1) g(`BR-${kod}-09`, `PDV kategorije ${kod} ${stopa} % nije točno izračunat.`);
    if (!["S", "Z"].includes(kod) && kat && !tekst(kat, "TaxExemptionReasonCode") && !tekst(kat, "TaxExemptionReason"))
      g(`BR-${kod}-10`, `kategorija ${kod} mora imati razlog oslobođenja.`);
    if (kod === "O" && prodavatelj && put(prodavatelj, "PartyTaxScheme").length)
      g("BR-O-02", "račun izvan sustava PDV-a ne smije imati PDV broj prodavatelja.");
    if (kod === "O" && kat && put(kat, "Percent").length) g("BR-O-05", "kategorija O ne smije imati stopu PDV-a.");
  }
  if (poKategoriji.size) g("BR-CO-18", "neka kategorija PDV-a sa stavki nema razradu.");
  if (zbrojPdv !== pdvUkupno) g("BR-CO-14", "ukupni PDV ne odgovara zbroju po kategorijama.");
  return greske;
}
