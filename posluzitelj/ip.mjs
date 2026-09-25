/**
 * Stvarna adresa klijenta — ne smije se uzeti iz zaglavlja koje klijent sam pošalje.
 *
 * - bez proxyja (npr. `pokreni.bat` na lokalnoj mreži): adresa TCP veze
 * - iza vlastitog proxyja (Caddy, VJERUJ_PROXYJU=1): zadnja adresa u X-Forwarded-For,
 *   jer je nju dopisao naš proxy; sve lijevo od nje je poslao klijent i može biti lažno
 */

/** Zaglavlja koja smije postaviti samo naš poslužitelj. */
export const ZAGLAVLJE_IP = "x-erp-ip";
const PROXY_ZAGLAVLJA = ["x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-forwarded-port", "x-real-ip", "forwarded"];

/**
 * @param {Record<string, string | string[] | undefined>} zaglavlja
 * @param {string | undefined} adresaVeze
 * @param {boolean} vjerujProxyju
 */
export function adresaKlijenta(zaglavlja, adresaVeze, vjerujProxyju) {
  const veza = (adresaVeze ?? "").replace(/^::ffff:/, "") || "nepoznat";
  if (!vjerujProxyju) return veza;
  const xff = zaglavlja["x-forwarded-for"];
  const niz = (Array.isArray(xff) ? xff.join(",") : (xff ?? ""))
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return niz.at(-1)?.replace(/^::ffff:/, "") ?? veza;
}

/**
 * Očisti zaglavlja zahtjeva prije nego ih vidi program.
 * @param {import("node:http").IncomingMessage} req
 * @param {boolean} vjerujProxyju
 */
export function ocistiZaglavlja(req, vjerujProxyju) {
  const ip = adresaKlijenta(req.headers, req.socket.remoteAddress, vjerujProxyju);
  if (!vjerujProxyju) for (const z of PROXY_ZAGLAVLJA) delete req.headers[z];
  req.headers[ZAGLAVLJE_IP] = ip;
  return ip;
}
