import { formatirajIznos, type Centi } from "@/domain/novac";
import type { PrismaClient } from "@/generated/prisma/client";
import { sljedeciMjesec } from "@/domain/najam";
import { imaPravo, type Prava } from "@/domain/prava";
import { OTVORENI_STATUSI } from "@/domain/servis";
import { izvjestaj } from "@/lib/izvjestaji";
import { pokreni, smijeIzvjestaj } from "@/lib/izvjestaji/izvrsi";

/**
 * Nadzorna ploča (korak 6.3): brojevi dolaze iz ISTIH izvještaja (pokreni) ili jednostavnih brojanja —
 * test provjerava da su jednaki izvještajima. Svaka kartica samo uz pravo na modul.
 */
export type Kartica = { kljuc: string; naslov: string; vrijednost: number; vrsta: "iznos" | "broj"; opis?: string; veza: string };
export type Upozorenje = { kljuc: string; tekst: string; veza: string; razina: "upozorenje" | "greska" };

export async function podaciNadzorne(db: PrismaClient, firmaId: string, prava: Prava, danas: string, sada = new Date()) {
  const kartice: Kartica[] = [];
  const upozorenja: Upozorenje[] = [];
  let prihodPoMjesecima: { mjesec: string; osnovica: number }[] = [];
  const iz = (k: string) => {
    const x = izvjestaj(k)!;
    return smijeIzvjestaj(prava, x) ? x : null;
  };
  const pocetakMjeseca = `${danas.slice(0, 7)}-01`;
  const prije11 = `${sljedeciMjesec(danas.slice(0, 7), -11)}-01`;
  const poslovi: Promise<void>[] = [];

  const prihod = iz("prihod-mjeseci");
  if (prihod) {
    poslovi.push(
      (async () => {
        const [m, g] = await Promise.all([
          pokreni(prihod, db, firmaId, prava, { godina: "sve", od: pocetakMjeseca, do: danas }, { skip: 0, take: 1 }, danas),
          pokreni(prihod, db, firmaId, prava, { godina: "sve", od: prije11, do: danas, sort: "mjesec", smjer: "asc" }, { skip: 0, take: 12 }, danas),
        ]);
        kartice.push({
          kljuc: "prihod",
          naslov: "Prihod ovaj mjesec",
          vrijednost: Number(m.rezultat.zbroj["osnovica"] ?? 0),
          vrsta: "iznos",
          opis: "bez PDV-a",
          veza: `/izvjestaji/prihod-mjeseci`,
        });
        prihodPoMjesecima = g.rezultat.redovi.map((r) => ({ mjesec: String(r["mjesec"]), osnovica: Number(r["osnovica"]) }));
      })(),
    );
  }
  const potr = iz("potrazivanja");
  if (potr) {
    poslovi.push(
      (async () => {
        const p = await pokreni(potr, db, firmaId, prava, {}, { skip: 0, take: 1 }, danas);
        const dosp = Number(p.rezultat.zbroj["dospjelo"] ?? 0);
        kartice.push({
          kljuc: "potrazivanja",
          naslov: "Potraživanja",
          vrijednost: Number(p.rezultat.zbroj["otvoreno"] ?? 0),
          vrsta: "iznos",
          opis: `dospjelo ${formatirajIznos(dosp as Centi, true)}`,
          veza: "/izvjestaji/potrazivanja",
        });
        if (dosp > 0)
          upozorenja.push({
            kljuc: "dospjelo",
            tekst: `Dospjela potraživanja: ${formatirajIznos(dosp as Centi, true)}`,
            veza: "/izvjestaji/potrazivanja",
            razina: "upozorenje",
          });
      })(),
    );
  }
  if (imaPravo(prava, "uredaji", "pregled")) {
    poslovi.push(
      (async () => {
        const grupe = await db.uredaj.groupBy({
          by: ["stanje"],
          where: { firmaId, stanje: { in: ["NA_SKLADISTU", "U_NAJMU", "NA_SERVISU"] } },
          _count: true,
        });
        const n = (s: string) => grupe.find((g) => g.stanje === s)?._count ?? 0;
        kartice.push({
          kljuc: "skladiste",
          naslov: "Na skladištu",
          vrijednost: n("NA_SKLADISTU"),
          vrsta: "broj",
          veza: "/uredaji?stanje=NA_SKLADISTU",
        });
        kartice.push({ kljuc: "najam", naslov: "U najmu", vrijednost: n("U_NAJMU"), vrsta: "broj", veza: "/uredaji?stanje=U_NAJMU" });
        const odobrenja = await db.odobrenje.count({ where: { firmaId, status: "CEKA" } });
        if (odobrenja)
          upozorenja.push({ kljuc: "odobrenja", tekst: `Zahtjeva čeka odobrenje: ${odobrenja}`, veza: "/odobrenja", razina: "upozorenje" });
      })(),
    );
  }
  if (imaPravo(prava, "servis", "pregled")) {
    poslovi.push(
      (async () => {
        const [otvoreno, prijavljeno] = await Promise.all([
          db.servisniNalog.count({ where: { firmaId, status: { in: [...OTVORENI_STATUSI] } } }),
          db.servisniNalog.count({ where: { firmaId, status: "PRIJAVLJEN" } }),
        ]);
        kartice.push({
          kljuc: "servis",
          naslov: "Otvoreni servisni nalozi",
          vrijednost: otvoreno,
          vrsta: "broj",
          veza: `/servis?${OTVORENI_STATUSI.map((s) => `status=${s}`).join("&")}`,
        });
        if (prijavljeno)
          upozorenja.push({
            kljuc: "prijave",
            tekst: `Prijave kvara s portala čekaju zaprimanje: ${prijavljeno}`,
            veza: "/servis?status=PRIJAVLJEN",
            razina: "upozorenje",
          });
      })(),
    );
  }
  if (imaPravo(prava, "nabava", "pregled")) {
    poslovi.push(
      (async () => {
        const n = await db.ulazniRacun.count({ where: { firmaId, status: "PRIMLJEN" } });
        kartice.push({ kljuc: "eracuni", naslov: "Ulazni eRačuni za prihvat", vrijednost: n, vrsta: "broj", veza: "/ulazni?status=PRIMLJEN" });
      })(),
    );
  }
  if (imaPravo(prava, "prodaja", "pregled")) {
    poslovi.push(
      (async () => {
        const [fiskal, eracuni] = await Promise.all([
          db.prodajniDokument.count({
            where: { firmaId, fiskalStatus: "CEKA", fiskalPokusaja: { gt: 0 }, izdano: { lt: new Date(sada.getTime() - 3600_000) } },
          }),
          db.eRacun.count({ where: { firmaId, status: { in: ["GRESKA", "ODBIJEN"] } } }),
        ]);
        if (fiskal)
          upozorenja.push({ kljuc: "fiskal", tekst: `Računi nisu fiskalizirani više od sat vremena: ${fiskal}`, veza: "/racuni", razina: "greska" });
        if (eracuni) upozorenja.push({ kljuc: "eracuni", tekst: `eRačuni odbijeni ili s greškom: ${eracuni}`, veza: "/eracuni", razina: "greska" });
      })(),
    );
  }
  await Promise.all(poslovi);
  const redoslijed = ["prihod", "potrazivanja", "skladiste", "najam", "servis", "eracuni"];
  kartice.sort((a, b) => redoslijed.indexOf(a.kljuc) - redoslijed.indexOf(b.kljuc));
  return { kartice, upozorenja, prihodPoMjesecima };
}
