/**
 * Poslužitelj programa: Next.js + ispravna adresa klijenta (vidi ip.mjs).
 *   node posluzitelj/index.mjs            (PORT, HOST, VJERUJ_PROXYJU iz okoline)
 */
import { createServer } from "node:http";
import next from "next";
import { ocistiZaglavlja } from "./ip.mjs";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const vjerujProxyju = process.env.VJERUJ_PROXYJU === "1";

const app = next({ dev: false, hostname: host, port });
const obradi = app.getRequestHandler();

await app.prepare();
createServer((req, res) => {
  ocistiZaglavlja(req, vjerujProxyju);
  obradi(req, res);
}).listen(port, host, () => {
  console.log(`ERP-WMS radi na http://${host === "0.0.0.0" ? "localhost" : host}:${port}${vjerujProxyju ? " (iza proxyja)" : ""}`);
});
