import forge from "node-forge";

export type Certifikat = { kljucPem: string; certPem: string; naziv: string; vrijediDo: Date };

/** FINA certifikat (.p12 / .pfx) s lozinkom → privatni ključ i certifikat (PEM). */
export function ucitajP12(sadrzaj: Buffer, lozinka: string): Certifikat {
  const asn = forge.asn1.fromDer(forge.util.createBuffer(sadrzaj.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn, false, lozinka);
  const kljucevi = [
    ...(p12.getBags({ bagType: forge.pki.oids["pkcs8ShroudedKeyBag"]! })[forge.pki.oids["pkcs8ShroudedKeyBag"]!] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids["keyBag"]! })[forge.pki.oids["keyBag"]!] ?? []),
  ];
  const certovi = p12.getBags({ bagType: forge.pki.oids["certBag"]! })[forge.pki.oids["certBag"]!] ?? [];
  const kljuc = kljucevi[0]?.key;
  // certifikat korisnika (ne CA): onaj koji nije izdavatelj sam sebi, inače prvi
  const cert = (certovi.find((c) => c.cert && c.cert.subject.hash !== c.cert.issuer.hash) ?? certovi[0])?.cert;
  if (!kljuc || !cert) throw new Error("U datoteci nema privatnog ključa i certifikata.");
  return {
    kljucPem: forge.pki.privateKeyToPem(kljuc),
    certPem: forge.pki.certificateToPem(cert),
    naziv: cert.subject.getField("CN")?.value ?? "",
    vrijediDo: cert.validity.notAfter,
  };
}

let demo: Certifikat | null = null;

/** Demo certifikat (samopotpisan, u memoriji) — za demo način i testove; CIS ga ne bi prihvatio. */
export function demoCertifikat(): Certifikat {
  if (demo) return demo;
  const kljucevi = forge.pki.rsa.generateKeyPair(2048);
  const c = forge.pki.createCertificate();
  c.publicKey = kljucevi.publicKey;
  c.serialNumber = "01";
  c.validity.notBefore = new Date();
  c.validity.notAfter = new Date(Date.now() + 5 * 365 * 864e5);
  const ime = [{ name: "commonName", value: "DEMO FISKAL ERP-WMS" }];
  c.setSubject(ime);
  c.setIssuer(ime);
  c.sign(kljucevi.privateKey, forge.md.sha256.create());
  demo = {
    kljucPem: forge.pki.privateKeyToPem(kljucevi.privateKey),
    certPem: forge.pki.certificateToPem(c),
    naziv: "DEMO FISKAL ERP-WMS",
    vrijediDo: c.validity.notAfter,
  };
  return demo;
}

/** .p12 iz demo certifikata (za testove učitavanja). */
export function demoP12(lozinka: string): Buffer {
  const d = demoCertifikat();
  const p12 = forge.pkcs12.toPkcs12Asn1(forge.pki.privateKeyFromPem(d.kljucPem), [forge.pki.certificateFromPem(d.certPem)], lozinka, {
    algorithm: "3des",
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}
