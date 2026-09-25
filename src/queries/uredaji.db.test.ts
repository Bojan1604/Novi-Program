import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SORTIRANJA_UREDAJA } from "@/domain/stupci-uredaja";
import { sFirmom } from "@/lib/firma-db";
import { napraviZadaneSifrarnike } from "@/services/sifrarnici";
import { napraviFirmu, ocistiBazu, testnaPrisma } from "@/test/baza";
import { popisUredaja, type FilterUredaja } from "./uredaji";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const drugo = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "Split" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id, naziv: "Monitor" } });
  const kat2 = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id, naziv: "Pisač" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const m1 = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "P2423D", proizvodjacId: p.id, kategorijaId: kat.id } });
  const m2 = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "Laser 1", proizvodjacId: p.id, kategorijaId: kat2.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac" } });
  const u = (serijski: string, x: object) =>
    prisma.uredaj.create({ data: { firmaId: firma.id, serijski, modelId: m1.id, stanje: "NA_SKLADISTU", skladisteId: skl.id, ...x } });
  await u("AAA111", { nabavnaCijena: "100.00", nabavniDatum: new Date("2026-01-10"), jamstvoDo: new Date("2027-01-10") });
  await u("BBB222", { stanje: "PRODAN", skladisteId: null, partnerId: kupac.id, nabavnaCijena: "300.00", nabavniDatum: new Date("2026-03-01") });
  await u("CCC333", { modelId: m2.id, skladisteId: drugo.id, nabavniDatum: new Date("2026-02-15"), jamstvoDo: new Date("2026-10-01") });
  const db = sFirmom(prisma, firma.id);
  const f = (x: Partial<FilterUredaja> = {}): FilterUredaja => ({
    stanje: [],
    skladiste: [],
    kategorija: [],
    proizvodjac: [],
    sort: { kljuc: "stvoreno", smjer: "desc" },
    stranica: 1,
    velicina: 25,
    ...x,
  });
  return { firma, db, f, drugo, kat2, kupac };
}

describe("popis uređaja (upit)", () => {
  it("svako sortiranje u oba smjera radi nad bazom; prazne vrijednosti na kraju", async () => {
    const { db, firma, f } = await pripremi();
    for (const kljuc of SORTIRANJA_UREDAJA) {
      for (const smjer of ["asc", "desc"] as const) {
        const r = await popisUredaja(db, firma.id, f({ sort: { kljuc, smjer } }), true);
        expect(r.ukupno).toBe(3);
      }
    }
    const nab = await popisUredaja(db, firma.id, f({ sort: { kljuc: "nabavnaCijena", smjer: "desc" } }), true);
    expect(nab.redovi.map((r) => r.serijski)).toEqual(["BBB222", "AAA111", "CCC333"]);
    const jam = await popisUredaja(db, firma.id, f({ sort: { kljuc: "jamstvoDo", smjer: "asc" } }), true);
    expect(jam.redovi.map((r) => r.serijski)).toEqual(["CCC333", "AAA111", "BBB222"]);
  });

  it("filtri: dio serijskog (bilo koja slova), stanje, skladište, kategorija, kupac, datumi, jamstvo", async () => {
    const { db, firma, f, drugo, kat2, kupac } = await pripremi();
    const s = async (x: Partial<FilterUredaja>) => (await popisUredaja(db, firma.id, f(x), true)).redovi.map((r) => r.serijski).sort();
    expect(await s({ trazi: "b22" })).toEqual(["BBB222"]);
    expect(await s({ trazi: "laser" })).toEqual(["CCC333"]);
    expect(await s({ stanje: ["PRODAN", "NA_SKLADISTU"] })).toEqual(["AAA111", "BBB222", "CCC333"]);
    expect(await s({ stanje: ["PRODAN"] })).toEqual(["BBB222"]);
    expect(await s({ stanje: ["NEPOZNATO"] })).toEqual(["AAA111", "BBB222", "CCC333"]);
    expect(await s({ skladiste: [drugo.id] })).toEqual(["CCC333"]);
    expect(await s({ kategorija: [kat2.id] })).toEqual(["CCC333"]);
    expect(await s({ partnerId: kupac.id })).toEqual(["BBB222"]);
    expect(await s({ od: "2026-02-01", do: "2026-02-28" })).toEqual(["CCC333"]);
    expect(await s({ jamstvoDo: "2026-12-31" })).toEqual(["CCC333"]);
    expect(await s({ skladiste: ["nije-uuid"] })).toEqual(["AAA111", "BBB222", "CCC333"]);
  });

  it("zbrojevi: po stanju i nabavna vrijednost samo s pravom; bez prava ni sortiranje po nabavnoj", async () => {
    const { db, firma, f } = await pripremi();
    const s = await popisUredaja(db, firma.id, f(), true);
    expect(s.poStanju).toEqual({ NA_SKLADISTU: 2, PRODAN: 1 });
    expect(s.zbrojNabavno).toBe(400_00);
    const bez = await popisUredaja(db, firma.id, f({ sort: { kljuc: "nabavnaCijena", smjer: "desc" } }), false);
    expect(bez.zbrojNabavno).toBeNull();
    expect(bez.redovi.every((r) => r.nabavnaCijena === null)).toBe(true);
    // bez prava sortiranje po nabavnoj ne smije otkriti redoslijed cijena → zadano (najnoviji)
    expect(bez.redovi.map((r) => r.serijski)).toEqual(["CCC333", "BBB222", "AAA111"]);
  });
});
