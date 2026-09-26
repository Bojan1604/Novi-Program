import { danas, datum as uDatum, dodajDane } from "../../src/domain/datum";
import { mjesecOd, sljedeciMjesec } from "../../src/domain/najam";
import { pravaClana, type Akter } from "../../src/services/korisnici";
import { kategorijeTroskova, oznaciPlaceno, spremiPonavljajuci, spremiTrosak, stvoriPonavljajuce } from "../../src/services/troskovi";
import type { DemoKontekst } from "./index";

/** [kategorija, opis, od, do (€ bez PDV-a), stopa PDV-a u %] */
const RUCNI: [string, string, number, number, number][] = [
  ["Režije", "Struja — HEP", 90, 220, 13],
  ["Režije", "Voda i odvodnja", 25, 60, 13],
  ["Prijevoz", "Gorivo — službeno vozilo", 40, 150, 25],
  ["Prijevoz", "Cestarina i parking", 10, 45, 25],
  ["Usluge", "Knjigovodstvene usluge", 250, 350, 25],
  ["Usluge", "Održavanje web stranice", 60, 120, 25],
  ["Usluge", "Čišćenje poslovnog prostora", 80, 140, 25],
  ["Ostalo", "Uredski materijal", 15, 90, 25],
  ["Ostalo", "Reprezentacija", 30, 120, 25],
  ["Telekomunikacije", "Mobilni paket — prodaja", 20, 45, 25],
];

/** Ručni troškovi kroz zadnjih ~5 mjeseci (većina plaćena), dva ponavljajuća troška i njihova stvorena mjesečna knjiženja. */
export async function demoTroskovi(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId, s } = k;
  const korisnikId = k.korisnici["Administrator"]!;
  const A: Akter = { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
  const kategorije = new Map((await kategorijeTroskova(prisma, firmaId)).map((x) => [x.naziv, x.id]));
  const kategorija = (naziv: string) => kategorije.get(naziv) ?? kategorije.values().next().value!;

  const danasnji = danas();
  const broj = Math.min(40, 20 + Math.floor(k.kolicine.racuna / 50));
  const pocetak = dodajDane(danasnji, -150);
  for (let i = 0; i < broj; i++) {
    const datum = dodajDane(pocetak, Math.floor((i * 150) / broj));
    const [kat, opis, od, doo, stopa] = s.izaberi(RUCNI);
    const iznos = s.cijeli(od * 100, doo * 100);
    const r = await spremiTrosak(prisma, A, null, {
      datum,
      kategorijaId: kategorija(kat),
      opis,
      iznos,
      pdv: Math.round((iznos * stopa) / 100),
      placeno: false,
    });
    if (!r.ok) throw new Error(`Demo troškovi: ${JSON.stringify(r.polja)}`);
    const datumPlacanja = dodajDane(datum, s.cijeli(0, 20));
    if (datumPlacanja <= danasnji && s.vjerojatnost(0.8)) await oznaciPlaceno(prisma, A, r.id, true, datumPlacanja);
  }

  // ponavljajući: najam prostora i internet, od prije 5 mjeseci; stvaranje dospjelih kao noćni posao
  const ovaj = mjesecOd(danasnji);
  await spremiPonavljajuci(prisma, A, {
    kategorijaId: kategorija("Najam prostora"),
    opis: "Najam poslovnog prostora — Savska 41",
    iznos: 120000,
    pdv: 30000,
    dan: 1,
    od: sljedeciMjesec(ovaj, -5),
    do: null,
  });
  await spremiPonavljajuci(prisma, A, {
    kategorijaId: kategorija("Telekomunikacije"),
    opis: "Internet i fiksna telefonija",
    iznos: 7990,
    pdv: 1998,
    dan: 10,
    od: sljedeciMjesec(ovaj, -5),
    do: null,
  });
  const stvoreno = await stvoriPonavljajuce(prisma, firmaId);
  // stariji mjeseci ponavljajućih su plaćeni, tekući još nije
  const ponavljajuci = await prisma.trosak.findMany({
    where: { firmaId, ponavljajuciId: { not: null }, datum: { lt: new Date(`${ovaj}-01T00:00:00Z`) } },
    select: { id: true, datum: true },
  });
  for (const t of ponavljajuci) await oznaciPlaceno(prisma, A, t.id, true, dodajDane(uDatum(t.datum.toISOString().slice(0, 10)), 3));
  k.log(`Troškovi: ${broj} ručnih, ${stvoreno} ponavljajućih`);
}
