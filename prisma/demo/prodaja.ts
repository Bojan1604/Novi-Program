import { danas, dodajDane } from "../../src/domain/datum";
import type { UlaznaStavka } from "../../src/domain/prodaja";
import { pravaClana, type Akter } from "../../src/services/korisnici";
import { cijenaZaKupca, izdajPonudu, izdajRacun, pretvori, spremiNacrt } from "../../src/services/prodaja";
import { dodajUplatu } from "../../src/services/uplate";
import { masovniRacuni } from "./racuni-masovno";
import type { DemoKontekst } from "./index";

/**
 * Podaci firme za dokumente, ponude, predračuni i računi — kroz iste servise kao program (pravila datuma,
 * numeracija, prijelazi stanja uređaja). Računi su kronološki u zadnjih 90 dana.
 */
export async function demoProdaja(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId, s } = k;
  await prisma.firma.update({
    where: { id: firmaId },
    data: {
      adresa: "Savska cesta 41",
      postanskiBroj: "10000",
      mjesto: "Zagreb",
      email: "info@demo-erp.hr",
      telefon: "+385 1 600 7000",
      web: "www.demo-erp.hr",
      iban: "HR1210010051863000160",
      banka: "Zagrebačka banka d.d.",
      podnozje: "Demo d.o.o. · Trgovački sud u Zagrebu · MBS 080000000 · temeljni kapital 2.500,00 € uplaćen u cijelosti",
    },
  });
  const korisnikId = k.korisnici["Prodavač"] ?? k.korisnici["Administrator"]!;
  const A: Akter = { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
  const kupci = await prisma.partner.findMany({
    where: { firmaId, kupac: true, aktivan: true, drzava: "HR" },
    select: { id: true },
    take: 30,
    orderBy: { naziv: "asc" },
  });
  const usluge = await prisma.usluga.findMany({ where: { firmaId }, select: { id: true, naziv: true, jedinica: true, kpd: true } });
  const brojRacuna = Math.min(k.kolicine.racuna, 150);
  const uredaji = await prisma.uredaj.findMany({
    where: { firmaId, stanje: "NA_SKLADISTU" },
    orderBy: { serijski: "asc" },
    take: brojRacuna * 2,
    select: {
      id: true,
      serijski: true,
      modelId: true,
      model: { select: { naziv: true, kpdProdaja: true, proizvodjac: { select: { naziv: true } } } },
    },
  });
  if (!kupci.length || !uredaji.length) return;

  const danasnji = danas();
  const pocetak = dodajDane(danasnji, -90);
  // velika baza: ostatak računa u serijama, stariji od računa iz servisa (koji nastavljaju numeraciju)
  await masovniRacuni(k, k.kolicine.racuna - brojRacuna, dodajDane(pocetak, -1));
  let u = 0;
  for (let i = 0; i < brojRacuna && u < uredaji.length; i++) {
    const datum = dodajDane(pocetak, Math.floor((i * 90) / brojRacuna));
    const kupac = s.izaberi(kupci).id;
    const stavke: UlaznaStavka[] = [];
    for (let n = s.cijeli(1, 2); n > 0 && u < uredaji.length; n--, u++) {
      const x = uredaji[u]!;
      stavke.push({
        vrsta: "UREDAJ",
        namjena: "PRODAJA",
        uredajId: x.id,
        modelId: x.modelId,
        naziv: `${x.model.proizvodjac.naziv} ${x.model.naziv}`,
        kpd: x.model.kpdProdaja ?? "26.20.11",
        jedinica: "kom",
        kolicina: 1000,
        cijena: (await cijenaZaKupca(prisma, firmaId, kupac, { modelId: x.modelId })) ?? 80000,
        popust: s.vjerojatnost(0.2) ? 500 : 0,
        stopa: 2500,
      });
    }
    if (usluge.length && s.vjerojatnost(0.5)) {
      const us = s.izaberi(usluge);
      stavke.push({
        vrsta: "USLUGA",
        namjena: "PRODAJA",
        uslugaId: us.id,
        naziv: us.naziv,
        kpd: us.kpd ?? "62.09.20",
        jedinica: us.jedinica,
        kolicina: us.jedinica === "h" ? s.cijeli(1, 4) * 500 : 1000,
        cijena: (await cijenaZaKupca(prisma, firmaId, kupac, { uslugaId: us.id })) ?? 4000,
        popust: 0,
        stopa: 2500,
      });
    }
    const n = await spremiNacrt(prisma, A, null, {
      vrsta: "RACUN",
      verzija: 0,
      partnerId: kupac,
      poslovnicaId: null,
      datum,
      vrijediDo: null,
      dospijece: dodajDane(datum, 15),
      popust: 0,
      napomena: null,
      nacinPlacanja: s.vjerojatnost(0.8) ? "T" : "K",
      stavke,
    });
    await izdajRacun(prisma, A, n.id, new Date(`${danasnji}T12:00:00Z`));
    // većina plaćena (u roku), neki djelomično, ostali otvoreni
    const ukupno = Number((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id }, select: { ukupno: true } })).ukupno) * 100;
    const datumUplate = dodajDane(datum, s.cijeli(0, 20));
    if (datumUplate <= danasnji && s.vjerojatnost(0.8)) {
      const iznos = s.vjerojatnost(0.9) ? Math.round(ukupno) : Math.round(ukupno / 2);
      await dodajUplatu(prisma, A, n.id, { datum: datumUplate, iznos, nacin: "T", opis: `Izvod ${i + 1}` }, new Date(`${danasnji}T12:00:00Z`));
    }
  }

  // ponuda → predračun, i jedna ponuda u nacrtu
  const us = usluge[0];
  if (us) {
    const stavka: UlaznaStavka = {
      vrsta: "USLUGA",
      namjena: "PRODAJA",
      uslugaId: us.id,
      naziv: us.naziv,
      kpd: us.kpd,
      jedinica: us.jedinica,
      kolicina: 8000,
      cijena: 4500,
      popust: 0,
      stopa: 2500,
    };
    const p = await spremiNacrt(prisma, A, null, {
      vrsta: "PONUDA",
      verzija: 0,
      partnerId: kupci[0]!.id,
      poslovnicaId: null,
      datum: danasnji,
      vrijediDo: dodajDane(danasnji, 15),
      dospijece: null,
      popust: 1000,
      napomena: "Ponuda vrijedi uz narudžbu do isteka roka.",
      stavke: [stavka],
    });
    await izdajPonudu(prisma, A, p.id);
    const pred = await pretvori(prisma, A, p.id, "PREDRACUN");
    await izdajPonudu(prisma, A, pred.id);
    await spremiNacrt(prisma, A, null, {
      vrsta: "PONUDA",
      verzija: 0,
      partnerId: kupci[1]?.id ?? null,
      poslovnicaId: null,
      datum: danasnji,
      vrijediDo: dodajDane(danasnji, 15),
      dospijece: null,
      popust: 0,
      napomena: null,
      stavke: [stavka],
    });
  }
  k.log(`Prodaja: ${brojRacuna} računa`);
}
