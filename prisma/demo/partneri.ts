import type { Prisma } from "../../src/generated/prisma/client";
import type { DemoKontekst } from "./index";

const MJESTA = [
  ["10000", "Zagreb"],
  ["21000", "Split"],
  ["51000", "Rijeka"],
  ["31000", "Osijek"],
  ["23000", "Zadar"],
  ["52100", "Pula"],
  ["42000", "Varaždin"],
  ["20000", "Dubrovnik"],
  ["44000", "Sisak"],
  ["47000", "Karlovac"],
] as const;
const ULICE = [
  "Ilica",
  "Vukovarska",
  "Savska cesta",
  "Frankopanska",
  "Trg bana Jelačića",
  "Zagrebačka",
  "Radnička cesta",
  "Heinzelova",
  "Kralja Tomislava",
  "Put Supavla",
];
const RIJECI = [
  "Alfa",
  "Beta",
  "Gama",
  "Delta",
  "Omega",
  "Nova",
  "Adria",
  "Panonija",
  "Dalmacija",
  "Kvarner",
  "Sjever",
  "Jug",
  "Mreža",
  "Kod",
  "Grad",
  "Most",
  "Luka",
  "Most",
];
const DJELATNOSTI = [
  "Informatika",
  "Trgovina",
  "Uredska oprema",
  "Računovodstvo",
  "Graditeljstvo",
  "Logistika",
  "Turizam",
  "Medicina",
  "Obrazovanje",
  "Promet",
];
const OBLICI = ["d.o.o.", "j.d.o.o.", "d.d.", "obrt"];

export async function demoPartneri(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId, s, kolicine } = k;
  const cjenik = await prisma.cjenik.create({ data: { firmaId, naziv: "Veleprodaja", opis: "Stalni kupci s ugovorom", popust: "5.00" } });
  const modeli = await prisma.modelUredaja.findMany({ where: { firmaId }, select: { id: true, preporucenaCijena: true }, take: 4 });
  await prisma.stavkaCjenika.createMany({
    data: modeli.map((m) => ({ firmaId, cjenikId: cjenik.id, modelId: m.id, cijena: (Number(m.preporucenaCijena ?? 0) * 0.9).toFixed(2) })),
  });

  const zauzeti = new Set<string>();
  const serija: Prisma.PartnerCreateManyInput[] = [];
  const spremi = async () => {
    if (serija.length) await prisma.partner.createMany({ data: serija.splice(0) });
  };
  for (let i = 0; i < kolicine.partnera; i++) {
    let oib = s.oib();
    while (zauzeti.has(oib)) oib = s.oib();
    zauzeti.add(oib);
    const [pb, mjesto] = s.izaberi(MJESTA);
    const dobavljac = i % 7 === 0;
    const naziv = `${s.izaberi(RIJECI)} ${s.izaberi(DJELATNOSTI)} ${s.izaberi(OBLICI)}${kolicine.partnera > 500 ? ` ${i + 1}` : ""}`;
    serija.push({
      firmaId,
      naziv,
      kupac: !dobavljac || i % 14 === 0,
      dobavljac,
      drzava: "HR",
      oib,
      pdvBroj: s.vjerojatnost(0.8) ? `HR${oib}` : null,
      adresa: `${s.izaberi(ULICE)} ${s.cijeli(1, 200)}`,
      postanskiBroj: pb,
      mjesto,
      email: `ured${i + 1}@primjer-${i + 1}.hr`,
      telefon: `+385 1 ${s.cijeli(200, 999)} ${s.cijeli(1000, 9999)}`,
      eRacunAdresa: s.vjerojatnost(0.7) ? `9934:${oib}` : null,
      rokPlacanjaDana: s.izaberi([0, 8, 15, 15, 30, 60]),
      cjenikId: i % 5 === 0 ? cjenik.id : null,
    });
    if (serija.length >= 1000) await spremi();
  }
  await spremi();

  // strani partneri (EU i treća zemlja)
  await prisma.partner.createMany({
    data: [
      {
        firmaId,
        naziv: "Muster IT GmbH",
        kupac: true,
        dobavljac: true,
        drzava: "DE",
        pdvBroj: "DE123456789",
        adresa: "Hauptstraße 5",
        postanskiBroj: "80331",
        mjesto: "München",
      },
      {
        firmaId,
        naziv: "Rač d.o.o.",
        kupac: true,
        drzava: "SI",
        pdvBroj: "SI12345678",
        adresa: "Slovenska cesta 10",
        postanskiBroj: "1000",
        mjesto: "Ljubljana",
      },
      { firmaId, naziv: "Sarajevo Tech d.o.o.", kupac: true, drzava: "BA", adresa: "Maršala Tita 1", postanskiBroj: "71000", mjesto: "Sarajevo" },
    ],
  });

  // poslovnice za prvih nekoliko kupaca
  const kupci = await prisma.partner.findMany({ where: { firmaId, kupac: true, drzava: "HR" }, take: 5, orderBy: { naziv: "asc" } });
  for (const p of kupci) {
    await prisma.poslovnica.createMany({
      data: [
        { firmaId, partnerId: p.id, naziv: "Sjedište", adresa: p.adresa, postanskiBroj: p.postanskiBroj, mjesto: p.mjesto, kontakt: "Recepcija" },
        { firmaId, partnerId: p.id, naziv: "Podružnica Split", adresa: "Domovinskog rata 10", postanskiBroj: "21000", mjesto: "Split" },
      ],
    });
  }
}
