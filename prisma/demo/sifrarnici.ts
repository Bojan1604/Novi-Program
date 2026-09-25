import type { DemoKontekst } from "./index";

/** Demo proizvođači, modeli (s KPD-om) i usluge; dodatno skladište. */
export const DEMO_MODELI = [
  { proizvodjac: "Lenovo", kategorija: "Prijenosno računalo", naziv: "ThinkPad T14 Gen 4", cijena: 1_099_00, jamstvo: 36 },
  { proizvodjac: "Lenovo", kategorija: "Prijenosno računalo", naziv: "ThinkPad E16", cijena: 849_00, jamstvo: 24 },
  { proizvodjac: "HP", kategorija: "Prijenosno računalo", naziv: "EliteBook 840 G10", cijena: 1_199_00, jamstvo: 36 },
  { proizvodjac: "HP", kategorija: "Pisač", naziv: "LaserJet Pro M404dn", cijena: 329_00, jamstvo: 12 },
  { proizvodjac: "HP", kategorija: "Multifunkcijski uređaj", naziv: "Color LaserJet MFP M480f", cijena: 899_00, jamstvo: 12 },
  { proizvodjac: "Dell", kategorija: "Monitor", naziv: "P2423D", cijena: 279_00, jamstvo: 36 },
  { proizvodjac: "Dell", kategorija: "Stolno računalo", naziv: "OptiPlex 7010", cijena: 749_00, jamstvo: 36 },
  { proizvodjac: "Apple", kategorija: "Tablet", naziv: "iPad 10.9 (10. gen.)", cijena: 429_00, jamstvo: 12 },
  { proizvodjac: "Samsung", kategorija: "Mobitel", naziv: "Galaxy A55", cijena: 399_00, jamstvo: 24 },
] as const;

const KPD_PRODAJA: Record<string, string> = {
  "Prijenosno računalo": "26.20.11",
  "Stolno računalo": "26.20.13",
  Monitor: "26.20.17",
  Pisač: "26.20.16",
  "Multifunkcijski uređaj": "26.20.18",
  Tablet: "26.20.11",
  Mobitel: "26.30.22",
};

export async function demoSifrarnici(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId } = k;
  await prisma.skladiste.create({ data: { firmaId, naziv: "Skladište Split", adresa: "Poljička cesta 1, 21000 Split" } });
  const kategorije = new Map((await prisma.kategorija.findMany({ where: { firmaId } })).map((x) => [x.naziv, x.id]));
  const proizvodjaci = new Map<string, string>();
  for (const naziv of [...new Set(DEMO_MODELI.map((m) => m.proizvodjac))]) {
    proizvodjaci.set(naziv, (await prisma.proizvodjac.create({ data: { firmaId, naziv } })).id);
  }
  for (const m of DEMO_MODELI) {
    await prisma.modelUredaja.create({
      data: {
        firmaId,
        naziv: m.naziv,
        proizvodjacId: proizvodjaci.get(m.proizvodjac)!,
        kategorijaId: kategorije.get(m.kategorija)!,
        kpdProdaja: KPD_PRODAJA[m.kategorija] ?? null,
        kpdNajam: "77.33.11",
        jamstvoMjeseci: m.jamstvo,
        preporucenaCijena: (m.cijena / 100).toFixed(2),
        marza: "18.00",
      },
    });
  }
  await prisma.usluga.createMany({
    data: [
      { firmaId, naziv: "Instalacija i konfiguracija", jedinica: "h", cijena: "45.00", kpd: "62.09.20" },
      { firmaId, naziv: "Servis — sat rada", jedinica: "h", cijena: "40.00", kpd: "95.11.10" },
      { firmaId, naziv: "Dostava", jedinica: "kom", cijena: "15.00", kpd: "53.20.19" },
    ],
  });
}
