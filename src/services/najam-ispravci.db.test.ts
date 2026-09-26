import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { UlaznaStavka } from "@/domain/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import {
  dodajUredajeNaUgovor,
  izdajRate,
  podaciZaNaplatu,
  postaviAutomatsko,
  preostaliVisak,
  spremiUgovor,
  vratiUredaj,
  type UlazUgovora,
} from "./najam";
import { izdajRacun, napraviOdobrenje, spremiNacrt, stornirajRacun, type UlazDokumenta } from "./prodaja";
import { napraviZadaneSifrarnike } from "./sifrarnici";

/** Ispravci nakon pregleda faze 3 (svaki test = jedan nalaz). */
const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-03-10T09:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o.", oib: "69435151530" } });
  const drugi = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Drugi d.o.o.", oib: "94577403194" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "LaserJet", proizvodjacId: p.id, kategorijaId: kat.id, kpdProdaja: "28.23.21", kpdNajam: "77.33.11" },
  });
  const uredaj = (s: string) =>
    prisma.uredaj.create({ data: { firmaId: firma.id, serijski: s, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id } });
  const stavka = (uredajId: string, namjena: "PRODAJA" | "NAJAM", cijena: number, popust = 0): UlaznaStavka => ({
    vrsta: "UREDAJ",
    namjena,
    uredajId,
    modelId: model.id,
    naziv: "HP LaserJet",
    kpd: namjena === "NAJAM" ? "77.33.11" : "28.23.21",
    jedinica: "kom",
    kolicina: 1000,
    cijena,
    popust,
    stopa: 2500,
  });
  const ulaz = (stavke: UlaznaStavka[], x: Partial<UlazDokumenta> = {}): UlazDokumenta => ({
    vrsta: "RACUN",
    verzija: 0,
    partnerId: kupac.id,
    poslovnicaId: null,
    datum: "2026-03-10",
    vrijediDo: null,
    dospijece: null,
    popust: 0,
    napomena: null,
    stavke,
    ...x,
  });
  const uUgovor: UlazUgovora = {
    partnerId: kupac.id,
    poslovnicaId: null,
    od: "2026-01-01",
    do: null,
    rucniBroj: null,
    rokPlacanjaDana: 15,
    nacinPlacanja: "T",
    uvjeti: null,
    napomenaRacuna: null,
    verzija: 0,
  };
  const ugovor = async () => {
    const r = await spremiUgovor(prisma, A, null, uUgovor);
    if (!r.ok) throw new Error("ugovor");
    return r.id;
  };
  return { firma, A, skl, kupac, drugi, uredaj, stavka, ulaz, ugovor, uUgovor };
}

describe("ispravci faze 3", () => {
  it("otkup uređaja iz najma zatvara plan danom prodaje — nema daljnjih rata; povrat prodanog samo zatvara plan", async () => {
    const { A, uredaj, stavka, ulaz, ugovor, skl } = await pripremi();
    const x = await uredaj("O-1");
    const y = await uredaj("O-2");
    const u = await ugovor();
    await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["O-1", "O-2"], od: "2026-01-01", cijena: 10000, izvor: "SKLADISTE" });
    const n = await spremiNacrt(prisma, A, null, ulaz([stavka(x.id, "PRODAJA", 50000)]));
    await izdajRacun(prisma, A, n.id, SADA);
    const plan = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId: u, uredajId: x.id } });
    expect(plan.do?.toISOString().slice(0, 10)).toBe("2026-03-10");
    const r = await izdajRate(prisma, A, u, "2026-05", new Date("2026-05-02T09:00:00Z"));
    const naziv = (await prisma.stavkaProdajnogDokumenta.findMany({ where: { dokumentId: r.id }, orderBy: { redoslijed: "asc" } })).map((s) => [
      s.naziv,
      s.kolicina,
    ]);
    expect(naziv).toContainEqual(["Najam HP LaserJet 03/2026 (10/31 dana)", 1000]);
    expect(naziv.filter(([n]) => String(n).includes("04/2026"))).toEqual([["Najam HP LaserJet 04/2026", 1000]]);
    // uređaj na servisu: povrat samo zatvara plan, bez promjene stanja
    await prisma.uredaj.update({ where: { id: y.id }, data: { stanje: "NA_SERVISU", stanjePrijeServisa: "U_NAJMU" } });
    const planY = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId: u, uredajId: y.id } });
    await vratiUredaj(prisma, A, u, planY.id, "2026-05-31", skl.id);
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: y.id } })).stanje).toBe("NA_SERVISU");
  });

  it("najam iz prodaje usred mjeseca: nema lažnog viška, mjesečna cijena bez jednokratnog popusta", async () => {
    const { A, uredaj, stavka, ulaz, firma } = await pripremi();
    const b = await uredaj("S-1");
    const n = await spremiNacrt(prisma, A, null, ulaz([stavka(b.id, "NAJAM", 4000, 5000)]));
    await izdajRacun(prisma, A, n.id, SADA);
    const d = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id } });
    const nap = await podaciZaNaplatu(prisma, firma.id, d.ugovorNajmaId!);
    expect((await preostaliVisak(prisma, firma.id, nap)).redovi).toEqual([]);
    expect(nap.motor[0]!.cijene).toEqual([{ od: "2026-03", iznos: 4000 }]);
  });

  it("višak se umanjuje za izdana odobrenja na računu", async () => {
    const { A, uredaj, ugovor, skl, firma } = await pripremi();
    await uredaj("V-1");
    const u = await ugovor();
    await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["V-1"], od: "2026-01-01", cijena: 10000, izvor: "SKLADISTE" });
    const r = await izdajRate(prisma, A, u, "2026-03", SADA);
    const plan = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId: u } });
    await vratiUredaj(prisma, A, u, plan.id, "2026-02-28", skl.id);
    expect((await preostaliVisak(prisma, firma.id, await podaciZaNaplatu(prisma, firma.id, u))).ukupno).toBe(10000);
    // odobrenje za ožujak (100,00)
    const od = await napraviOdobrenje(prisma, A, r.id, SADA);
    const st = await prisma.stavkaProdajnogDokumenta.findMany({ where: { dokumentId: od.id }, orderBy: { redoslijed: "asc" } });
    await prisma.stavkaProdajnogDokumenta.deleteMany({ where: { id: { in: st.filter((s) => !s.naziv.includes("03/2026")).map((s) => s.id) } } });
    await izdajRacun(prisma, A, od.id, SADA);
    const v = await preostaliVisak(prisma, firma.id, await podaciZaNaplatu(prisma, firma.id, u));
    expect([v.ukupno, v.redovi]).toEqual([0, []]);
  });

  it("kupac postojećeg ugovora se ne može promijeniti; rate najviše 12 mjeseci unaprijed", async () => {
    const { A, ugovor, uUgovor, drugi } = await pripremi();
    const u = await ugovor();
    await expect(spremiUgovor(prisma, A, u, { ...uUgovor, partnerId: drugi.id })).rejects.toThrow("ne može promijeniti");
    await expect(izdajRate(prisma, A, u, "9999-12", SADA)).rejects.toThrow("12 mjeseci unaprijed");
  });

  it("storno računa iz prodaje s najmom: uređaj na skladište, ugovor otvoren računom obrisan; storno računa rata isključuje automatsko", async () => {
    const { A, uredaj, stavka, ulaz, ugovor, skl, firma } = await pripremi();
    const b = await uredaj("N-1");
    const n = await spremiNacrt(prisma, A, null, ulaz([stavka(b.id, "NAJAM", 4000)]));
    await izdajRacun(prisma, A, n.id, SADA);
    await stornirajRacun(prisma, A, n.id, skl.id, SADA);
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: b.id } })).stanje).toBe("NA_SKLADISTU");
    expect(await prisma.ugovorNajma.count({ where: { firmaId: firma.id } })).toBe(0);

    await uredaj("N-2");
    const u = await ugovor();
    await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["N-2"], od: "2026-01-01", cijena: 10000, izvor: "SKLADISTE" });
    await postaviAutomatsko(prisma, A, u, true, SADA);
    const r = await izdajRate(prisma, A, u, "2026-03", SADA);
    await stornirajRacun(prisma, A, r.id, skl.id, SADA);
    expect(await prisma.ugovorNajma.findUniqueOrThrow({ where: { id: u } })).toMatchObject({ automatski: false });
    expect((await prisma.ugovorNajma.findUniqueOrThrow({ where: { id: u } })).automatskiGreska).toContain("storniran račun");
  });
});
