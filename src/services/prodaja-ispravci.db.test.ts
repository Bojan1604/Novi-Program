import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { UlaznaStavka } from "@/domain/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { posaljiERacun } from "./eracun";
import { fiskaliziraj } from "./fiskalizacija";
import { pravaClana, type Akter } from "./korisnici";
import { dodajPredujam, izdajRacun, napraviOdobrenje, spremiNacrt, stornirajRacun, type UlazDokumenta } from "./prodaja";
import { napraviZadaneSifrarnike } from "./sifrarnici";

/** Ispravci nakon pregleda faze 2 (svaki test = jedan nalaz). */
const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");
const usluga = (cijena: number, x: Partial<UlaznaStavka> = {}): UlaznaStavka => ({
  vrsta: "RUCNA",
  namjena: "PRODAJA",
  naziv: "Usluga",
  kpd: "62.09.20",
  jedinica: "h",
  kolicina: 1000,
  cijena,
  popust: 0,
  stopa: 2500,
  ...x,
});

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await prisma.firma.update({ where: { id: firma.id }, data: { iban: "HR1210010051863000160" } });
  await napraviZadaneSifrarnike(prisma, firma.id);
  const akter = async (uloga: string) => {
    const k = await napraviKorisnika(prisma, firma.id, { uloga });
    return { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! } satisfies Akter;
  };
  const A = await akter("Voditelj");
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o.", oib: "69435151530" } });
  const drugi = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Drugi d.o.o.", oib: "94577403194" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "ProBook", proizvodjacId: p.id, kategorijaId: kat.id, kpdProdaja: "26.20.11", kpdNajam: "77.33.11" },
  });
  const uredaj = (serijski: string) =>
    prisma.uredaj.create({ data: { firmaId: firma.id, serijski, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id } });
  const uStavka = (id: string): UlaznaStavka => ({
    vrsta: "UREDAJ",
    namjena: "PRODAJA",
    uredajId: id,
    modelId: model.id,
    naziv: "HP ProBook",
    kpd: "26.20.11",
    jedinica: "kom",
    kolicina: 1000,
    cijena: 100000,
    popust: 0,
    stopa: 2500,
  });
  const ulaz = (stavke: UlaznaStavka[], x: Partial<UlazDokumenta> = {}): UlazDokumenta => ({
    vrsta: "RACUN",
    verzija: 0,
    partnerId: kupac.id,
    poslovnicaId: null,
    datum: "2026-09-25",
    vrijediDo: null,
    dospijece: null,
    popust: 0,
    napomena: null,
    stavke,
    ...x,
  });
  const izdaj = async (stavke: UlaznaStavka[], x: Partial<UlazDokumenta> = {}, tko: Akter = A) => {
    const n = await spremiNacrt(prisma, tko, null, ulaz(stavke, x));
    return { id: n.id, ...(await izdajRacun(prisma, tko, n.id, SADA)) };
  };
  return { firma, A, akter, skl, kupac, drugi, uredaj, uStavka, ulaz, izdaj };
}

describe("ispravci faze 2", () => {
  it("promjena oznake prostora: novi niz od 1 bez sudara s postojećim brojevima", async () => {
    const { firma, izdaj } = await pripremi();
    expect((await izdaj([usluga(1000)])).broj).toBe("1/PP1/1");
    expect((await izdaj([usluga(1000)])).broj).toBe("2/PP1/1");
    await prisma.firma.update({ where: { id: firma.id }, data: { oznakaProstora: "PP2" } });
    expect((await izdaj([usluga(1000)])).broj).toBe("1/PP2/1");
  });

  it("odobrenje ne može vratiti uređaj prodan na drugom računu", async () => {
    const { A, uredaj, uStavka, izdaj, drugi } = await pripremi();
    const [x, y] = await Promise.all([uredaj("X-1"), uredaj("Y-1")]);
    const a = await izdaj([uStavka(x.id)]);
    await izdaj([uStavka(y.id)], { partnerId: drugi.id });
    const od = await napraviOdobrenje(prisma, A, a.id, SADA);
    await prisma.stavkaProdajnogDokumenta.updateMany({ where: { dokumentId: od.id }, data: { uredajId: y.id } });
    await expect(izdajRacun(prisma, A, od.id, SADA)).rejects.toThrow("nije prodan na toj stavci");
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: y.id } })).stanje).toBe("PRODAN");
  });

  it("popust dokumenta ne umanjuje odbitak predujma; predujam 0 % ostaje 0 %", async () => {
    const { A, ulaz, izdaj } = await pripremi();
    const pred = await izdaj([usluga(100000)], { vrsta: "PREDUJAM" });
    const kon = await spremiNacrt(prisma, A, null, ulaz([usluga(200000)], { popust: 1000 }));
    await dodajPredujam(prisma, A, kon.id, pred.id);
    await izdajRacun(prisma, A, kon.id, SADA);
    const r = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: kon.id } });
    // 2.000 − 10 % = 1.800; − 1.000 predujam = 800 + 25 % = 1.000
    expect([r.osnovica.toFixed(2), r.ukupno.toFixed(2)]).toEqual(["800.00", "1000.00"]);

    const pred0 = await izdaj([usluga(50000, { stopa: 0 })], { vrsta: "PREDUJAM" });
    const kon0 = await spremiNacrt(prisma, A, null, ulaz([usluga(100000, { stopa: 0 })]));
    await dodajPredujam(prisma, A, kon0.id, pred0.id);
    const odbitak = await prisma.stavkaProdajnogDokumenta.findFirstOrThrow({ where: { dokumentId: kon0.id, vrsta: "PREDUJAM" } });
    expect(odbitak.stopa).toBe(0);
    // preglednik ne može promijeniti stopu odbitka
    const n = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: kon0.id } });
    await spremiNacrt(prisma, A, kon0.id, {
      ...ulaz([
        usluga(100000, { stopa: 0 }),
        { ...usluga(-50000), vrsta: "PREDUJAM", kolicina: -1000, cijena: 50000, stopa: 2500, izvornaStavkaId: odbitak.izvornaStavkaId },
      ]),
      verzija: n.verzija,
    });
    await izdajRacun(prisma, A, kon0.id, SADA);
    const r0 = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: kon0.id } });
    expect([r0.osnovica.toFixed(2), r0.pdv.toFixed(2)]).toEqual(["500.00", "0.00"]);
  });

  it("odobrenje zadržava kategoriju PDV-a izvornog računa i kad kupac postane EU obveznik", async () => {
    const { A, kupac, izdaj } = await pripremi();
    const r = await izdaj([usluga(100000)]);
    await prisma.partner.update({ where: { id: kupac.id }, data: { drzava: "DE", pdvBroj: "DE123456789", oib: null } });
    const od = await napraviOdobrenje(prisma, A, r.id, SADA);
    await izdajRacun(prisma, A, od.id, SADA);
    const o = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: od.id }, include: { stavke: true } });
    expect(o.stavke.map((s) => [s.kategorija, s.stopa])).toEqual([["HR", 2500]]);
    expect(o.ukupno.toFixed(2)).toBe("-1250.00");
  });

  it("odobrenje smije mijenjati i izdati samo korisnik s punim pravom prodaje", async () => {
    const { A, akter, izdaj, ulaz } = await pripremi();
    const prodavac = await akter("Prodavač");
    const r = await izdaj([usluga(100000)]);
    const od = await napraviOdobrenje(prisma, A, r.id, SADA);
    const n = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: od.id } });
    await expect(spremiNacrt(prisma, prodavac, od.id, { ...ulaz([]), vrsta: "ODOBRENJE", verzija: n.verzija })).rejects.toThrow("punim pravom");
    await expect(izdajRacun(prisma, prodavac, od.id, SADA)).rejects.toThrow("punim pravom");
  });

  it("storno računa za predujam: moguć dok nije odbijen, nakon odbitka nije", async () => {
    const { A, skl, ulaz, izdaj } = await pripremi();
    const p1 = await izdaj([usluga(10000)], { vrsta: "PREDUJAM" });
    const s = await stornirajRacun(prisma, A, p1.id, skl.id, SADA);
    expect((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: s.id } })).ukupno.toFixed(2)).toBe("-125.00");
    const p2 = await izdaj([usluga(10000)], { vrsta: "PREDUJAM" });
    const kon = await spremiNacrt(prisma, A, null, ulaz([usluga(50000)]));
    await dodajPredujam(prisma, A, kon.id, p2.id);
    await izdajRacun(prisma, A, kon.id, SADA);
    await expect(stornirajRacun(prisma, A, p2.id, skl.id, SADA)).rejects.toThrow("već odbijen");
    // odobrenje konačnog računa ne odobrava odbitak predujma
    const od = await napraviOdobrenje(prisma, A, kon.id, SADA);
    expect((await prisma.stavkaProdajnogDokumenta.findMany({ where: { dokumentId: od.id } })).map((x) => x.vrsta)).toEqual(["RUCNA"]);
  });

  it("poslovnica bez kupca se odbija", async () => {
    const { A, firma, kupac, ulaz } = await pripremi();
    const pos = await prisma.poslovnica.create({ data: { firmaId: firma.id, partnerId: kupac.id, naziv: "Split" } });
    await expect(spremiNacrt(prisma, A, null, ulaz([usluga(1000)], { partnerId: null, poslovnicaId: pos.id }))).rejects.toThrow("ne pripada kupcu");
  });

  it("isti račun se ne šalje istovremeno dvaput (CIS i eRačun)", async () => {
    const { A, firma, izdaj } = await pripremi();
    // fiskalizacija: račun ostaje „čeka“ pa se dva slanja natječu
    await prisma.firma.update({ where: { id: firma.id }, data: { fiskalNacin: "ISKLJUCENA" } });
    const r = await izdaj([usluga(1000)], { nacinPlacanja: "G" });
    await prisma.firma.update({ where: { id: firma.id }, data: { fiskalNacin: "DEMO" } });
    await prisma.prodajniDokument.update({ where: { id: r.id }, data: { fiskalStatus: "CEKA", zki: "0".repeat(32) } });
    const oba = await Promise.all([fiskaliziraj(prisma, firma.id, r.id, SADA), fiskaliziraj(prisma, firma.id, r.id, SADA)]);
    expect(oba.filter((x) => "jir" in x)).toHaveLength(1);

    const e = await izdaj([usluga(1000)]);
    const slanja = await Promise.allSettled([posaljiERacun(prisma, A, e.id, SADA), posaljiERacun(prisma, A, e.id, SADA)]);
    expect(slanja.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.eRacun.count({ where: { dokumentId: e.id } })).toBe(1);
  });
});
