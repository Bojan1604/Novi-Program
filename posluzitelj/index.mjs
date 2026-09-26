/**
 * Poslužitelj programa: Next.js + ispravna adresa klijenta (vidi ip.mjs).
 *   node posluzitelj/index.mjs            (PORT, HOST, VJERUJ_PROXYJU iz okoline)
 *   HTTPS=1 → https:// (kamera na mobitelu u lokalnoj mreži); certifikat vidi https.mjs
 */
import { createServer as http } from "node:http";
import { createServer as https } from "node:https";
import net from "node:net";
import next from "next";
import { adreseRacunala, certifikat } from "./https.mjs";
import { ocistiZaglavlja } from "./ip.mjs";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const vjerujProxyju = process.env.VJERUJ_PROXYJU === "1";

const app = next({ dev: false, hostname: host, port });
const obradi = app.getRequestHandler();

await app.prepare();
// HTTPS se čita nakon prepare() jer Next tada učita .env
const sHttps = process.env.HTTPS === "1";
const rukovatelj = (req, res) => {
  ocistiZaglavlja(req, vjerujProxyju);
  obradi(req, res);
};
const c = sHttps ? await certifikat() : null;
/**
 * S HTTPS-om isti port prima i http://: prvi bajt veze odluči — TLS počinje s 0x16, sve ostalo je običan
 * HTTP koji se preusmjeri na https:// (inače preglednik upisan bez „https://“ dobije praznu stranicu).
 */
function httpsIPreusmjeravanje(cert) {
  const tls = https({ cert: cert.cert, key: cert.key }, rukovatelj);
  const preusmjeri = http((req, res) => {
    const domacin = (req.headers.host ?? `localhost:${port}`).replace(/[^\w.:[\]-]/g, "");
    res.writeHead(301, { Location: `https://${domacin}${req.url ?? "/"}` });
    res.end();
  });
  return net.createServer((veza) => {
    veza.once("data", (prvi) => {
      veza.pause();
      veza.unshift(prvi);
      (prvi[0] === 0x16 ? tls : preusmjeri).emit("connection", veza);
      process.nextTick(() => veza.resume());
    });
    veza.on("error", () => veza.destroy());
  });
}
const posluzitelj = c ? httpsIPreusmjeravanje(c) : http(rukovatelj);
posluzitelj.listen(port, host, () => {
  const shema = c ? "https" : "http";
  console.log(`ERP-WMS radi na ${shema}://${host === "0.0.0.0" ? "localhost" : host}:${port}${vjerujProxyju ? " (iza proxyja)" : ""}`);
  if (host === "0.0.0.0") for (const a of adreseRacunala()) console.log(`  u lokalnoj mreži: ${shema}://${a}:${port}`);
  if (c?.samopotpisan) console.log("  Certifikat je samopotpisan: preglednik će jednom upozoriti — odaberite „Napredno → Nastavi“.");
});
