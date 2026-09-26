import { randomUUID } from "node:crypto";
import { dodajDane, danas, type Datum } from "../../src/domain/datum";
import { centiUDecimal } from "../../src/domain/novac";
import { brojRacuna, vrstaBrojacaRacuna } from "../../src/domain/numeracija";
import { izracunajDokument, type UlaznaStavka } from "../../src/domain/prodaja";
import type { Prisma } from "../../src/generated/prisma/client";
import { statusKupca } from "../../src/services/prodaja";
import type { DemoKontekst } from "./index";

/**
 * Velika baza (7.2): računi iznad onih izdanih kroz servis (npr. 100.000) upisuju se u serijama — isti izračun
 * iznosa i PDV-a (izracunajDokument), ista snimka, broj i brojač kao izdavanje; stariji su od računa iz servisa.
 * Stavke su ručne (bez uređaja), da stanja uređaja ostanu dosljedna.
 */
export async function masovniRacuni(k: DemoKontekst, broj: number, doDatuma: Datum): Promise<void> {
  if (broj <= 0) return;
  const { prisma, firmaId: f, s } = k;
  const firma = await prisma.firma.findUniqueOrThrow({ where: { id: f } });
  const kupci = await prisma.partner.findMany({
    where: { firmaId: f, kupac: true, aktivan: true },
    select: {
      id: true,
      naziv: true,
      oib: true,
      pdvBroj: true,
      drzava: true,
      pdvStatus: true,
      adresa: true,
      postanskiBroj: true,
      mjesto: true,
      email: true,
      eRacunAdresa: true,
    },
    take: 5000,
  });
  const modeli = await prisma.modelUredaja.findMany({
    where: { firmaId: f },
    select: { naziv: true, preporucenaCijena: true, kpdProdaja: true, proizvodjac: { select: { naziv: true } } },
  });
  if (!kupci.length || !modeli.length) return;
  const korisnikId = k.korisnici["Prodavač"] ?? k.korisnici["Administrator"]!;
  const firmaSnimka = {
    naziv: firma.naziv,
    oib: firma.oib,
    adresa: firma.adresa,
    postanskiBroj: firma.postanskiBroj,
    mjesto: firma.mjesto,
    email: firma.email,
    telefon: firma.telefon,
    web: firma.web,
    iban: firma.iban,
    banka: firma.banka,
    uSustavuPdv: firma.uSustavuPdv,
    podnozje: firma.podnozje,
    boja: firma.boja,
    logoId: firma.logoId,
  };
  const pocetak = dodajDane(doDatuma, -700);
  // ravnomjerno kroz ~2 godine, kronološki
  const datumi = Array.from({ length: broj }, (_, i) => dodajDane(pocetak, Math.floor((i * 700) / broj)));
  const redni = new Map<number, number>();
  const vrsta = vrstaBrojacaRacuna("racun", firma.oznakaProstora, firma.oznakaUredaja);
  let dok: Prisma.ProdajniDokumentCreateManyInput[] = [];
  let stavke: Prisma.StavkaProdajnogDokumentaCreateManyInput[] = [];
  let uplate: Prisma.UplataCreateManyInput[] = [];
  const isprazni = async () => {
    if (dok.length) await prisma.prodajniDokument.createMany({ data: dok });
    if (stavke.length) await prisma.stavkaProdajnogDokumenta.createMany({ data: stavke });
    if (uplate.length) await prisma.uplata.createMany({ data: uplate });
    dok = [];
    stavke = [];
    uplate = [];
  };
  const dan = (d: string) => new Date(`${d}T00:00:00Z`);
  for (let i = 0; i < broj; i++) {
    const datum = datumi[i]!;
    const godina = Number(datum.slice(0, 4));
    const r = (redni.get(godina) ?? 0) + 1;
    redni.set(godina, r);
    const kupac = s.izaberi(kupci);
    const ulazne: UlaznaStavka[] = [];
    for (let n = s.cijeli(1, 3); n > 0; n--) {
      const m = s.izaberi(modeli);
      ulazne.push({
        vrsta: "RUCNA",
        namjena: "PRODAJA",
        naziv: `${m.proizvodjac.naziv} ${m.naziv}`,
        kpd: m.kpdProdaja ?? "26.20.11",
        jedinica: "kom",
        kolicina: s.cijeli(1, 3) * 1000,
        cijena: Math.round(Number(m.preporucenaCijena ?? 500) * 100),
        popust: s.vjerojatnost(0.2) ? 500 : 0,
        stopa: 2500,
        vrstaIsporuke: "ROBA",
      });
    }
    const iz = izracunajDokument(ulazne, {
      firmaUSustavuPdv: firma.uSustavuPdv,
      pdvPoNaplacenoj: firma.pdvPoNaplacenoj,
      statusKupca: statusKupca(kupac),
      popust: 0,
    });
    const id = randomUUID();
    const brojDok = brojRacuna(r, firma.oznakaProstora, firma.oznakaUredaja);
    const placen = datum < dodajDane(danas(), -30) ? s.vjerojatnost(0.92) : s.vjerojatnost(0.5);
    dok.push({
      id,
      firmaId: f,
      vrsta: "RACUN",
      status: "IZDAN",
      broj: brojDok,
      godina,
      redni: r,
      datum: dan(datum),
      dospijece: dan(dodajDane(datum, 15)),
      partnerId: kupac.id,
      nacinPlacanja: "T",
      osnovica: centiUDecimal(iz.zbrojevi.osnovica),
      pdv: centiUDecimal(iz.zbrojevi.pdv),
      ukupno: centiUDecimal(iz.zbrojevi.ukupno),
      placeno: centiUDecimal(placen ? iz.zbrojevi.ukupno : 0),
      snimka: {
        firma: firmaSnimka,
        kupac: {
          naziv: kupac.naziv,
          oib: kupac.oib,
          pdvBroj: kupac.pdvBroj,
          drzava: kupac.drzava,
          adresa: kupac.adresa,
          postanskiBroj: kupac.postanskiBroj,
          mjesto: kupac.mjesto,
          email: kupac.email,
          eRacunAdresa: kupac.eRacunAdresa,
        },
        poslovnica: null,
        napomene: iz.napomene,
        racun: {
          oznakaProstora: firma.oznakaProstora,
          oznakaUredaja: firma.oznakaUredaja,
          nacinPlacanja: "T",
          pdvPoNaplacenoj: firma.pdvPoNaplacenoj,
          operater: "Demo",
          poKategoriji: iz.zbrojevi.poKategoriji,
        },
      } as unknown as Prisma.InputJsonValue,
      korisnikId,
      korisnik: "Demo",
      izdano: new Date(`${datum}T10:00:00Z`),
      fiskalStatus: "NIJE_POTREBNO",
      fiskalNacin: "DEMO",
    });
    for (const [j, x] of iz.grupirane.entries())
      stavke.push({
        firmaId: f,
        dokumentId: id,
        redoslijed: j,
        vrsta: x.vrsta,
        namjena: x.namjena,
        naziv: x.naziv,
        kpd: x.kpd ?? null,
        jedinica: x.jedinica,
        kolicina: x.kolicina,
        cijena: centiUDecimal(x.cijena),
        popust: x.popust,
        vrstaIsporuke: x.vrstaIsporuke,
        stopa: x.kategorija.stopa,
        kategorija: x.kategorija.kod,
        iznos: centiUDecimal(x.iznos),
      });
    if (placen) {
      const d = dodajDane(datum, s.cijeli(0, 20));
      uplate.push({
        firmaId: f,
        dokumentId: id,
        datum: dan(d > danas() ? danas() : d),
        iznos: centiUDecimal(iz.zbrojevi.ukupno),
        nacin: "T",
        opis: `Izvod ${i + 1}`,
        korisnikId,
        korisnik: "Demo",
      });
    }
    if (dok.length >= 2000) await isprazni();
  }
  await isprazni();
  // brojač kao da su izdani redom: sljedeći račun (kroz servis) nastavlja iza zadnjeg
  for (const [godina, zadnji] of redni) {
    const zadnjiDatum = datumi.filter((d) => d.startsWith(String(godina))).at(-1)!;
    await prisma.$executeRaw`
      INSERT INTO "Brojac" ("firmaId", "vrsta", "godina", "zadnji", "zadnjiDatum") VALUES (${f}::uuid, ${vrsta}, ${godina}, ${zadnji}, ${zadnjiDatum}::date)
      ON CONFLICT ("firmaId", "vrsta", "godina") DO UPDATE SET "zadnji" = EXCLUDED."zadnji", "zadnjiDatum" = EXCLUDED."zadnjiDatum"`;
  }
}
