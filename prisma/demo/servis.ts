import { danas, datum as uDatum, dodajDane, type Datum } from "../../src/domain/datum";
import { pravaClana, type Akter } from "../../src/services/korisnici";
import { promijeniStatusServisa, spremiDijagnozu, zaprimiNaServis, zavrsiNalog } from "../../src/services/servis";
import type { DemoKontekst } from "./index";

const KVAROVI = [
  "Ne pali se, punjač svijetli.",
  "Ekran treperi nakon zagrijavanja.",
  "Glasan ventilator, pregrijavanje.",
  "Papir se zaglavljuje u ulaznoj ladici.",
  "Ne spaja se na Wi-Fi mrežu.",
  "Tipkovnica: ne rade tipke E i R.",
  "Baterija traje manje od sat vremena.",
  "Ispis s prugama, toner nov.",
];
const DIJAGNOZE = [
  "Neispravna matična ploča — zamjena pod jamstvom.",
  "Istrošena baterija, zamjena.",
  "Očišćen hladnjak, nova termalna pasta.",
  "Zamijenjen valjak za uvlačenje papira.",
  "Ažuriran BIOS i upravljački programi.",
  "Zamijenjena tipkovnica.",
];

/**
 * Servisni nalozi na prodanim i iznajmljenim uređajima (prijem nakon prodaje/početka najma, zadnjih ~60 dana):
 * većina prođe dijagnozu i popravak i vrati se klijentu, ostali ostaju otvoreni u raznim statusima.
 */
export async function demoServis(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId, s } = k;
  const korisnikId = k.korisnici["Serviser"] ?? k.korisnici["Administrator"]!;
  const A: Akter = { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
  const skladiste = await prisma.skladiste.findFirst({ where: { firmaId, aktivan: true }, orderBy: { naziv: "asc" }, select: { id: true } });
  const broj = Math.min(100, Math.max(5, Math.floor(k.kolicine.racuna / 30)));
  const danasnji = danas();
  const dan = (d: Date) => uDatum(d.toISOString().slice(0, 10));

  // kandidati: uređaj kod klijenta i datum od kojeg je kod njega (prodajni račun ili početak najma)
  const [prodani, najam] = await Promise.all([
    prisma.stavkaProdajnogDokumenta.findMany({
      where: { firmaId, uredajId: { not: null }, dokument: { vrsta: "RACUN", status: "IZDAN" }, uredaj: { stanje: "PRODAN" } },
      select: { uredaj: { select: { serijski: true } }, dokument: { select: { datum: true } } },
      orderBy: { id: "asc" },
      take: broj * 2,
    }),
    prisma.uredajNaUgovoru.findMany({
      where: { firmaId, do: null, uredaj: { stanje: "U_NAJMU" } },
      select: { od: true, uredaj: { select: { serijski: true } } },
      orderBy: { id: "asc" },
      take: broj * 2,
    }),
  ]);
  const promijesaj = <T>(niz: T[]): T[] => {
    for (let i = niz.length - 1; i > 0; i--) {
      const j = s.cijeli(0, i);
      [niz[i], niz[j]] = [niz[j]!, niz[i]!];
    }
    return niz;
  };
  // naizmjence prodani i iznajmljeni
  const kupljeni = promijesaj(prodani.flatMap((x) => (x.uredaj ? [[x.uredaj.serijski, dan(x.dokument.datum)] as const] : [])));
  const unajmljeni = promijesaj(najam.map((x) => [x.uredaj.serijski, dan(x.od)] as const));
  const kandidati = new Map<string, Datum>();
  for (let i = 0; i < Math.max(kupljeni.length, unajmljeni.length); i++)
    for (const x of [kupljeni[i], unajmljeni[i]]) if (x && !kandidati.has(x[0])) kandidati.set(x[0], x[1]);
  const popis = [...kandidati];
  const najranije = dodajDane(danasnji, -60);
  const nalozi = popis
    .slice(0, broj)
    .map(([serijski, od]) => {
      const osnova = od > najranije ? od : najranije;
      const datum = dodajDane(osnova, s.cijeli(1, 20));
      return { serijski, datum: datum > danasnji ? danasnji : datum };
    })
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.serijski.localeCompare(b.serijski)));

  let zavrseno = 0;
  for (const [i, x] of nalozi.entries()) {
    const n = await zaprimiNaServis(prisma, A, {
      serijski: x.serijski,
      opisKvara: s.izaberi(KVAROVI),
      datum: x.datum,
      skladisteId: skladiste?.id ?? null,
      kontakt: s.vjerojatnost(0.5) ? `+385 9${s.cijeli(1, 9)} ${s.cijeli(100, 999)} ${s.cijeli(1000, 9999)}` : null,
    });
    let verzija = 0;
    const status = async (novi: string, poruka: string | null = null) =>
      promijeniStatusServisa(prisma, A, n.id, { status: novi, poruka, verzija: verzija++ });
    // zadnji nalozi ostaju otvoreni: zaprimljen, na dijagnozi, čeka dijelove
    const otvoren = i >= nalozi.length - Math.max(2, Math.floor(nalozi.length / 4));
    const faza = otvoren ? i % 3 : 3;
    if (faza >= 1) {
      await status("DIJAGNOZA");
      await spremiDijagnozu(prisma, A, n.id, {
        dijagnoza: s.izaberi(DIJAGNOZE),
        napomenaKlijentu: s.vjerojatnost(0.5) ? "Popravak je pod jamstvom, bez troška za vas." : null,
        verzija: verzija++,
      });
    }
    if (faza === 2) await status("CEKA_DIJELOVE", "Naručeni rezervni dijelovi, očekujemo ih za 5–7 radnih dana.");
    if (faza === 3) {
      await status("POPRAVAK");
      await status("GOTOV", "Uređaj je spreman za preuzimanje.");
      const kraj = dodajDane(x.datum, s.cijeli(2, 10));
      await zavrsiNalog(prisma, A, n.id, {
        ishod: "VRACEN",
        datum: kraj > danasnji ? danasnji : kraj,
        skladisteId: skladiste?.id ?? null,
        napomena: s.vjerojatnost(0.3) ? "Preuzeo klijent osobno." : null,
      });
      zavrseno++;
    }
  }
  k.log(`Servis: ${nalozi.length} naloga, ${zavrseno} završeno`);
}
