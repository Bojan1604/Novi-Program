/**
 * npm run eposlovanje:provjera -- [--oib <OIB firme>] [--posalji]
 *
 * Korak 7.5: provjera spremnosti za testno okruženje Porezne uprave (CIS) i eRačun, na računalu na kojem
 * program radi (mreža i certifikat su tamo). Ništa ne upisuje u bazu.
 *  1. CIS TEST: je li poslužitelj dostupan (EchoRequest, bez certifikata).
 *  2. Firma: način fiskalizacije, certifikat (čita se, vrijedi, OIB u certifikatu = OIB firme).
 *  3. --posalji: jedan probni račun (1,00 €, gotovina) potpisan certifikatom firme šalje se SAMO na TEST
 *     adresu CIS-a — očekuje se JIR. Nikad na produkciju.
 *  4. eRačun: koji je posrednik postavljen.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { datumVrijemeCis, iznosCis, ulazZki } from "../src/domain/fiskalizacija";
import { ADRESE_CIS, izracunajZki, posaljiCis, potpisi, racunZahtjev } from "../src/lib/fiskalizacija/cis";
import { napraviPrismu } from "../src/lib/prisma";
import { certifikatFirme } from "../src/services/fiskalizacija";

const ok = (t: string) => console.log(`✔ ${t}`);
const lose = (t: string) => {
  console.log(`✘ ${t}`);
  process.exitCode = 1;
};

async function echo(): Promise<void> {
  const xml =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>` +
    `<tns:EchoRequest xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73">ERP-WMS proba</tns:EchoRequest></soapenv:Body></soapenv:Envelope>`;
  try {
    const o = await fetch(ADRESE_CIS.TEST, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://e-porezna.porezna-uprava.hr/fiskalizacija/2012/services/FiskalizacijaService/echo",
      },
      body: xml,
      signal: AbortSignal.timeout(15_000),
    });
    const t = await o.text();
    if (t.includes("ERP-WMS proba")) ok(`CIS TEST dostupan (${ADRESE_CIS.TEST})`);
    else lose(`CIS TEST odgovorio neočekivano (HTTP ${o.status}): ${t.slice(0, 200)}`);
  } catch (e) {
    lose(
      `CIS TEST nije dostupan: ${e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e)} — provjerite vatrozid (izlazni port 8449) i proxy`,
    );
  }
}

async function glavno(): Promise<void> {
  const a = process.argv.slice(2);
  const i = a.indexOf("--oib");
  const oib = i >= 0 ? a[i + 1] : undefined;
  await echo();

  const prisma = napraviPrismu(process.env["DATABASE_URL"] ?? "");
  try {
    const firme = await prisma.firma.findMany({ where: { aktivna: true, ...(oib ? { oib } : {}) } });
    if (firme.length !== 1) {
      lose(firme.length ? `Više firmi — odaberite: ${firme.map((f) => `--oib ${f.oib} (${f.naziv})`).join(", ")}` : "Firma nije pronađena.");
      return;
    }
    const f = firme[0]!;
    console.log(`\nFirma: ${f.naziv} (OIB ${f.oib}), fiskalizacija: ${f.fiskalNacin}, prostor/uređaj ${f.oznakaProstora}/${f.oznakaUredaja}`);
    if (f.fiskalNacin === "DEMO" || f.fiskalNacin === "ISKLJUCENA")
      console.log("  Za test s Poreznom upravom u Postavkama odaberite način TEST (nakon učitavanja certifikata).");
    if (!f.fiskalCertifikat) {
      lose("Certifikat nije učitan (Postavke firme → Fiskalizacija → .p12 i lozinka).");
    } else {
      try {
        const c = certifikatFirme({ ...f, fiskalNacin: "TEST" });
        const dana = Math.floor((c.vrijediDo.getTime() - Date.now()) / 86_400_000);
        if (dana < 0) lose(`Certifikat „${c.naziv}“ je istekao.`);
        else ok(`Certifikat „${c.naziv}“ vrijedi još ${dana} dana`);
        if (a.includes("--posalji")) {
          const sada = new Date();
          const redni = Math.floor(Date.now() / 1000) % 1_000_000;
          const zki = izracunajZki(
            ulazZki({ oib: f.oib, vrijeme: sada, redni, prostor: f.oznakaProstora, uredaj: f.oznakaUredaja, ukupno: 100 }),
            c.kljucPem,
          );
          const xml = racunZahtjev(
            {
              oib: f.oib,
              uSustavuPdv: f.uSustavuPdv,
              datumVrijeme: datumVrijemeCis(sada),
              redni,
              prostor: f.oznakaProstora,
              uredaj: f.oznakaUredaja,
              pdv: f.uSustavuPdv ? [{ stopa: "25.00", osnovica: iznosCis(80), iznos: iznosCis(20) }] : [],
              ukupno: iznosCis(100),
              nacinPlacanja: "G",
              oibOperatera: f.oib,
              zki,
              naknadnaDostava: false,
            },
            randomUUID(),
          );
          const r = await posaljiCis(ADRESE_CIS.TEST, potpisi(xml, c)).catch((e: unknown) => ({
            greska: e instanceof Error ? e.message : String(e),
          }));
          if ("jir" in r) ok(`Probni račun ${redni}/${f.oznakaProstora}/${f.oznakaUredaja} fiskaliziran na TEST okruženju — JIR ${r.jir}`);
          else lose(`CIS TEST odbio probni račun: ${r.greska}`);
        }
      } catch (e) {
        lose(`Certifikat se ne može pročitati: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const posrednik = process.env["ERACUN_POSREDNIK"] ?? "demo";
  console.log(`\neRačun: posrednik „${posrednik}“`);
  if (posrednik === "demo")
    console.log(
      "  Demo posrednik: eRačuni se izrađuju (UBL 2.1) i „šalju“ unutar programa. Za stvarno slanje treba spoj na odabranog posrednika (src/lib/eracun/posrednik.ts) i njegove testne pristupne podatke.",
    );
}

glavno().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
