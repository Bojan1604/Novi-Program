import { DOMParser } from "@xmldom/xmldom";

export type ProcitaniERacun = {
  vrsta: "RACUN" | "ODOBRENJE";
  broj: string;
  datum: string;
  dospijece: string | null;
  dobavljac: { naziv: string; oib: string | null };
  kupacOib: string | null;
  /** centi (odobrenje: pozitivni iznosi kako su na dokumentu) */
  osnovica: number;
  pdv: number;
  ukupno: number;
};

/** Čitanje primljenog UBL eRačuna (Invoice / CreditNote) — samo polja potrebna za evidenciju ulaznog računa. */
export function procitajUbl(xml: string): ProcitaniERacun {
  const greske: string[] = [];
  const dok = new DOMParser({ onError: (_l: string, m: string) => void greske.push(m) }).parseFromString(xml, "text/xml") as unknown as Document;
  const k = dok.documentElement;
  if (greske.length || !k || !["Invoice", "CreditNote"].includes(k.localName)) throw new Error("Datoteka nije UBL eRačun.");
  const djeca = (e: Element, ime: string) =>
    Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === ime);
  const put = (e: Element, ...imena: string[]) => imena.reduce<Element[]>((sk, ime) => sk.flatMap((x) => djeca(x, ime)), [e])[0];
  const t = (e: Element | undefined, ...imena: string[]) => (e ? (put(e, ...imena)?.textContent?.trim() ?? "") : "");
  const iznos = (...imena: string[]) => {
    const v = t(k, ...imena);
    if (!/^-?\d+(\.\d{1,2})?$/.test(v)) return 0;
    return Math.round(Number(v) * 100);
  };
  const prod = put(k, "AccountingSupplierParty", "Party");
  const kup = put(k, "AccountingCustomerParty", "Party");
  const oib = (p: Element | undefined) => {
    const v = t(p, "PartyLegalEntity", "CompanyID") || t(p, "EndpointID");
    const o = v.replace(/^HR/, "");
    return /^\d{11}$/.test(o) ? o : null;
  };
  const broj = t(k, "ID");
  const datum = t(k, "IssueDate");
  if (!broj || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error("eRačun nema broj ili datum.");
  const dospijece = t(k, "DueDate") || t(k, "PaymentMeans", "PaymentDueDate") || null;
  const osnovica = iznos("LegalMonetaryTotal", "TaxExclusiveAmount");
  const ukupno = iznos("LegalMonetaryTotal", "PayableAmount") || iznos("LegalMonetaryTotal", "TaxInclusiveAmount");
  return {
    vrsta: k.localName === "CreditNote" ? "ODOBRENJE" : "RACUN",
    broj,
    datum,
    dospijece: dospijece && /^\d{4}-\d{2}-\d{2}$/.test(dospijece) ? dospijece : null,
    dobavljac: { naziv: t(prod, "PartyLegalEntity", "RegistrationName") || t(prod, "PartyName", "Name") || "Nepoznat dobavljač", oib: oib(prod) },
    kupacOib: oib(kup),
    osnovica,
    pdv: iznos("TaxTotal", "TaxAmount"),
    ukupno,
  };
}
