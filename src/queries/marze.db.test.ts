import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sFirmom } from "@/lib/firma-db";
import type { UlaznaStavka } from "@/domain/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "@/services/korisnici";
import { dodajPredujam, izdajRacun, napraviOdobrenje, spremiNacrt, stornirajRacun, type UlazDokumenta } from "@/services/prodaja";
import { napraviZadaneSifrarnike } from "@/services/sifrarnici";
import { marzeDokumenata, poMjesecima, postotakMarze } from "./marze";
import { popisProdaje } from "./prodaja";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const RUJAN = new Date("2026-09-25T10:00:00Z");
const LISTOPAD = new Date("2026-10-05T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "Latitude", proizvodjacId: p.id, kategorijaId: kat.id, kpdProdaja: "26.20.11", kpdNajam: "77.33.11" },
  });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o.", oib: "69435151530" } });
  const uredaj = (serijski: string, nabavna: string | null) =>
    prisma.uredaj.create({
      data: { firmaId: firma.id, serijski, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id, nabavnaCijena: nabavna },
    });
  const uStavka = (id: string, cijena: number): UlaznaStavka => ({
    vrsta: "UREDAJ",
    namjena: "PRODAJA",
    uredajId: id,
    modelId: model.id,
    naziv: "Dell Latitude",
    kpd: "26.20.11",
    jedinica: "kom",
    kolicina: 1000,
    cijena,
    popust: 0,
    stopa: 2500,
  });
  const usluga = (cijena: number): UlaznaStavka => ({
    vrsta: "RUCNA",
    namjena: "PRODAJA",
    naziv: "Instalacija",
    kpd: "62.09.20",
    jedinica: "h",
    kolicina: 1000,
    cijena,
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
  const izdaj = async (stavke: UlaznaStavka[], x: Partial<UlazDokumenta> = {}, sada = RUJAN) => {
    const n = await spremiNacrt(prisma, A, null, ulaz(stavke, x));
    await izdajRacun(prisma, A, n.id, sada);
    return n.id;
  };
  return { firma, A, skl, uredaj, uStavka, usluga, ulaz, izdaj };
}

describe("marže", () => {
  it("po dokumentu: nabava prodanih uređaja (i u grupiranoj stavci), storno poništava, odobrenje vraća; zbroj po mjesecima = zbroj dokumenata", async () => {
    const { firma, A, skl, uredaj, uStavka, usluga, ulaz, izdaj } = await pripremi();
    const [u1, u2, u3, u4, u5] = await Promise.all([
      uredaj("M-001", "600.00"),
      uredaj("M-002", "650.00"),
      uredaj("M-003", null),
      uredaj("M-004", "500.00"),
      uredaj("M-005", "700.00"),
    ]);
    // rujan: 2 uređaja istog modela (jedna stavka) + usluga; uređaj bez nabavne; storniran račun
    const r1 = await izdaj([uStavka(u1.id, 100000), uStavka(u2.id, 100000), usluga(5000)]);
    const r2 = await izdaj([uStavka(u3.id, 80000)]);
    const r3 = await izdaj([uStavka(u4.id, 90000)]);
    const st = await stornirajRacun(prisma, A, r3, skl.id, RUJAN);
    // listopad: račun s uređajem, pa odobrenje za taj uređaj (vraćen); predujam i konačni račun
    const r4 = await izdaj([uStavka(u5.id, 120000)], { datum: "2026-10-05" }, LISTOPAD);
    const od = await napraviOdobrenje(prisma, A, r4, LISTOPAD);
    await prisma.prodajniDokument.update({ where: { id: od.id }, data: { datum: new Date("2026-10-05T00:00:00Z") } });
    await izdajRacun(prisma, A, od.id, LISTOPAD);
    const pred = await izdaj([usluga(40000)], { vrsta: "PREDUJAM", datum: "2026-10-05" }, LISTOPAD);
    const kon = await spremiNacrt(prisma, A, null, ulaz([usluga(100000)], { datum: "2026-10-05" }));
    await dodajPredujam(prisma, A, kon.id, pred);
    await izdajRacun(prisma, A, kon.id, LISTOPAD);
    // nacrt ne ulazi
    await spremiNacrt(prisma, A, null, ulaz([usluga(99999)]));

    const d = new Map((await marzeDokumenata(prisma, firma.id, {})).map((m) => [m.id, m]));
    expect(d.size).toBe(8);
    expect(d.get(r1)).toMatchObject({ prihod: 205000, nabava: 125000, marza: 80000, bezNabavne: 0 });
    expect(d.get(r2)).toMatchObject({ prihod: 80000, nabava: 0, marza: 80000, bezNabavne: 1 });
    expect(d.get(r3)).toMatchObject({ prihod: 90000, nabava: 50000, marza: 40000 });
    expect(d.get(st.id)).toMatchObject({ prihod: -90000, nabava: -50000, marza: -40000 });
    expect(d.get(r4)).toMatchObject({ prihod: 120000, nabava: 70000, marza: 50000 });
    expect(d.get(od.id)).toMatchObject({ prihod: -120000, nabava: -70000, marza: -50000 });
    expect(d.get(pred)).toMatchObject({ prihod: 40000, marza: 40000 });
    expect(d.get(kon.id)).toMatchObject({ prihod: 60000, marza: 60000 });

    const mj = poMjesecima([...d.values()]);
    expect(mj).toEqual([
      { mjesec: "2026-10", dokumenata: 4, prihod: 100000, nabava: 0, marza: 100000, bezNabavne: 0 },
      { mjesec: "2026-09", dokumenata: 4, prihod: 285000, nabava: 125000, marza: 160000, bezNabavne: 1 },
    ]);
    // prihod po mjesecima = zbroj osnovica izdanih dokumenata
    const osnovice = await prisma.prodajniDokument.aggregate({ where: { firmaId: firma.id, status: { not: "NACRT" } }, _sum: { osnovica: true } });
    expect(mj.reduce((a, m) => a + m.prihod, 0)).toBe(Math.round(Number(osnovice._sum.osnovica) * 100));
    expect(mj.reduce((a, m) => a + m.marza, 0)).toBe([...d.values()].reduce((a, m) => a + m.marza, 0));
    // razdoblje i odabrani dokumenti
    expect((await marzeDokumenata(prisma, firma.id, { od: "2026-10-01", do: "2026-10-31" })).map((m) => m.mjesec)).toEqual(Array(4).fill("2026-10"));
    expect((await marzeDokumenata(prisma, firma.id, { ids: [r1] })).map((m) => m.id)).toEqual([r1]);
    expect(await marzeDokumenata(prisma, firma.id, { ids: [] })).toEqual([]);
    // druga firma ne vidi ništa
    const druga = await napraviFirmu(prisma);
    expect(await marzeDokumenata(prisma, druga.id, {})).toEqual([]);
    expect(postotakMarze(80000, 205000)).toBe(3902);
    expect(postotakMarze(0, 0)).toBeNull();
  });

  it("popis računa: serijski broj nalazi i račun s grupiranom stavkom; razdoblje po datumu", async () => {
    const { firma, uredaj, uStavka, izdaj } = await pripremi();
    const [u1, u2] = await Promise.all([uredaj("G-001", "1.00"), uredaj("G-002", "1.00")]);
    const r = await izdaj([uStavka(u1.id, 1000), uStavka(u2.id, 1000)]);
    const db = sFirmom(prisma, firma.id);
    const f = { vrsta: [], status: [], sort: { kljuc: "datum" as const, smjer: "desc" as const }, stranica: 1, velicina: 50 };
    const vrste = ["RACUN", "PREDUJAM", "STORNO", "ODOBRENJE"];
    expect((await popisProdaje(db, firma.id, { ...f, trazi: "g-002" }, vrste)).redovi.map((x) => x.id)).toEqual([r]);
    expect((await popisProdaje(db, firma.id, { ...f, od: "2026-09-25", do: "2026-09-25" }, vrste)).ukupno).toBe(1);
    expect((await popisProdaje(db, firma.id, { ...f, od: "2026-09-26" }, vrste)).ukupno).toBe(0);
    expect((await popisProdaje(db, firma.id, { ...f, do: "2026-09-24" }, vrste)).ukupno).toBe(0);
  });
});
