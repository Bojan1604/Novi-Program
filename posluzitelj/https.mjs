/**
 * HTTPS za lokalnu mrežu: kamera na mobitelu radi samo preko https://.
 * Certifikat iz HTTPS_CERT/HTTPS_KLJUC (datoteke), inače samopotpisani u mapi .https/
 * (vrijedi za localhost, ime računala i sve njegove IPv4 adrese; obnavlja se kad istekne ili se adresa promijeni).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, networkInterfaces } from "node:os";
import { join } from "node:path";
import selfsigned from "selfsigned";

/** IPv4 adrese računala (bez 127.0.0.1) — na njih se spaja mobitel. */
export function adreseRacunala() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}

export async function certifikat(mapa = join(process.cwd(), ".https")) {
  if (process.env.HTTPS_CERT && process.env.HTTPS_KLJUC) {
    return { cert: readFileSync(process.env.HTTPS_CERT), key: readFileSync(process.env.HTTPS_KLJUC), samopotpisan: false };
  }
  const adrese = adreseRacunala();
  const oznaka = [hostname(), ...adrese].join(",");
  const put = join(mapa, "certifikat.json");
  if (existsSync(put)) {
    const s = JSON.parse(readFileSync(put, "utf8"));
    if (s.oznaka === oznaka && new Date(s.vrijediDo) > new Date(Date.now() + 7 * 864e5)) return { cert: s.cert, key: s.key, samopotpisan: true };
  }
  const vrijediDo = new Date();
  vrijediDo.setFullYear(vrijediDo.getFullYear() + 2);
  const p = await selfsigned.generate([{ name: "commonName", value: "ERP-WMS" }], {
    keySize: 2048,
    algorithm: "sha256",
    notAfterDate: vrijediDo,
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 2, value: hostname() },
          { type: 7, ip: "127.0.0.1" },
          ...adrese.map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
  });
  mkdirSync(mapa, { recursive: true });
  writeFileSync(put, JSON.stringify({ oznaka, vrijediDo, cert: p.cert, key: p.private }), { mode: 0o600 });
  return { cert: p.cert, key: p.private, samopotpisan: true };
}
