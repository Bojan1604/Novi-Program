import { createHash, createSign, randomUUID } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import type { Certifikat } from "./certifikat";

/** ZKI: RSA-SHA1 potpis ulaza privatnim ključem certifikata, pa MD5 potpisa (32 heksadecimalna znaka). */
export function izracunajZki(ulaz: string, kljucPem: string): string {
  const potpis = createSign("RSA-SHA1").update(ulaz, "utf8").sign(kljucPem);
  return createHash("md5").update(potpis).digest("hex");
}

export type RacunZaCis = {
  oib: string;
  uSustavuPdv: boolean;
  datumVrijeme: string;
  redni: number;
  prostor: string;
  uredaj: string;
  pdv: { stopa: string; osnovica: string; iznos: string }[];
  ukupno: string;
  nacinPlacanja: string;
  oibOperatera: string;
  zki: string;
  naknadnaDostava: boolean;
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** SOAP RacunZahtjev (shema Fiskalizacija v1.x) — potpisuje se zatim `potpisi`. */
export function racunZahtjev(r: RacunZaCis, idPoruke = randomUUID(), vrijemeSlanja = r.datumVrijeme): string {
  const pdv = r.pdv.length
    ? `<tns:Pdv>${r.pdv.map((p) => `<tns:Porez><tns:Stopa>${p.stopa}</tns:Stopa><tns:Osnovica>${p.osnovica}</tns:Osnovica><tns:Iznos>${p.iznos}</tns:Iznos></tns:Porez>`).join("")}</tns:Pdv>`
    : "";
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>` +
    `<tns:RacunZahtjev xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73" Id="RacunZahtjev">` +
    `<tns:Zaglavlje><tns:IdPoruke>${idPoruke}</tns:IdPoruke><tns:DatumVrijeme>${vrijemeSlanja}</tns:DatumVrijeme></tns:Zaglavlje>` +
    `<tns:Racun><tns:Oib>${esc(r.oib)}</tns:Oib><tns:USustPdv>${r.uSustavuPdv}</tns:USustPdv><tns:DatVrijeme>${r.datumVrijeme}</tns:DatVrijeme>` +
    `<tns:OznSlijed>P</tns:OznSlijed><tns:BrRac><tns:BrOznRac>${r.redni}</tns:BrOznRac><tns:OznPosPr>${esc(r.prostor)}</tns:OznPosPr><tns:OznNapUr>${esc(r.uredaj)}</tns:OznNapUr></tns:BrRac>` +
    `${pdv}<tns:IznosUkupno>${r.ukupno}</tns:IznosUkupno><tns:NacinPlac>${r.nacinPlacanja}</tns:NacinPlac><tns:OibOper>${esc(r.oibOperatera)}</tns:OibOper>` +
    `<tns:ZastKod>${r.zki}</tns:ZastKod><tns:NakDost>${r.naknadnaDostava}</tns:NakDost></tns:Racun></tns:RacunZahtjev></soapenv:Body></soapenv:Envelope>`
  );
}

/** XML potpis (enveloped, RSA-SHA1, kako traži CIS) s certifikatom u KeyInfo. */
export function potpisi(xml: string, c: Certifikat): string {
  const certB64 = c.certPem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, "");
  const s = new SignedXml({
    privateKey: c.kljucPem,
    publicCert: c.certPem,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`,
  });
  s.addReference({
    xpath: "//*[local-name(.)='RacunZahtjev']",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  s.computeSignature(xml, { location: { reference: "//*[local-name(.)='RacunZahtjev']", action: "append" } });
  return s.getSignedXml();
}

export const ADRESE_CIS = {
  TEST: "https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest",
  PRODUKCIJA: "https://cis.porezna-uprava.hr:8449/FiskalizacijaService",
} as const;

/** Odgovor CIS-a → JIR ili greška (šifra i poruka). */
export function procitajOdgovor(xml: string): { jir: string } | { greska: string } {
  const d = new DOMParser().parseFromString(xml, "text/xml");
  const jir = d.getElementsByTagNameNS("*", "Jir")[0]?.textContent?.trim();
  if (jir) return { jir };
  const sifra = d.getElementsByTagNameNS("*", "SifraGreske")[0]?.textContent?.trim();
  const poruka = d.getElementsByTagNameNS("*", "PorukaGreske")[0]?.textContent?.trim();
  return { greska: sifra ? `${sifra}: ${poruka ?? ""}` : "CIS nije vratio JIR." };
}

/** Slanje potpisanog zahtjeva CIS-u (HTTPS). Mrežna greška → iznimka (račun ide u naknadnu dostavu). */
export async function posaljiCis(adresa: string, potpisaniXml: string): Promise<{ jir: string } | { greska: string }> {
  const o = await fetch(adresa, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://e-porezna.porezna-uprava.hr/fiskalizacija/2012/services/FiskalizacijaService/racuni",
    },
    body: potpisaniXml,
    signal: AbortSignal.timeout(10_000),
  });
  return procitajOdgovor(await o.text());
}
