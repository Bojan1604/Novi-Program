import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rateUredaja, zaIzdati } from "@/domain/najam";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { dodajUredajeNaUgovor, podaciZaNaplatu, postaviMjesec, spremiUgovor } from "./najam";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Najmoprimac d.o.o.", oib: "69435151530" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "LaserJet", proizvodjacId: p.id, kategorijaId: kat.id, kpdProdaja: "28.23.21", kpdNajam: "77.33.11" },
  });
  const r = await spremiUgovor(prisma, A, null, {
    partnerId: kupac.id,
    poslovnicaId: null,
    od: "2024-01-01",
    do: null,
    rucniBroj: null,
    rokPlacanjaDana: 15,
    nacinPlacanja: "T",
    uvjeti: null,
    napomenaRacuna: null,
    verzija: 0,
  });
  if (!r.ok) throw new Error("ugovor");
  return { firma, A, skl, model, u: r.id };
}

describe("raspored najma", () => {
  it("pauza klikom, ručni iznos, povratak na plan; izdani mjesec se ne mijenja", async () => {
    const { firma, A, skl, model, u } = await pripremi();
    await prisma.uredaj.create({ data: { firmaId: firma.id, serijski: "L-1", modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id } });
    await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["L-1"], od: "2024-01-01", cijena: 3000, izvor: "SKLADISTE" });
    const plan = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId: u } });
    await postaviMjesec(prisma, A, u, plan.id, "2024-02", { vrsta: "PAUZA" });
    await postaviMjesec(prisma, A, u, plan.id, "2024-03", { vrsta: "RUCNO", iznos: 1234 });
    const iznosi = async () => {
      const n = await podaciZaNaplatu(prisma, firma.id, u);
      return rateUredaja(n.uvjeti, n.motor[0]!, n.fakturirano, "2024-04").map((r) => [r.mjesec, r.iznos, r.izvor]);
    };
    expect(await iznosi()).toEqual([
      ["2024-01", 3000, "PLAN"],
      ["2024-02", 0, "PAUZA"],
      ["2024-03", 1234, "RUCNO"],
      ["2024-04", 3000, "PLAN"],
    ]);
    await postaviMjesec(prisma, A, u, plan.id, "2024-02", { vrsta: "PLAN" });
    expect((await iznosi())[1]).toEqual(["2024-02", 3000, "PLAN"]);
    await prisma.rataNajma.create({ data: { firmaId: firma.id, planId: plan.id, mjesec: new Date("2024-01-01T00:00:00Z"), iznos: "30.00" } });
    await expect(postaviMjesec(prisma, A, u, plan.id, "2024-01", { vrsta: "PAUZA" })).rejects.toThrow("izdana");
    await expect(postaviMjesec(prisma, A, u, randomUUID(), "2024-05", { vrsta: "PAUZA" })).rejects.toThrow("nije na ovom ugovoru");
  });

  it("50.000 rata (2.000 uređaja × 25 mjeseci): učitavanje i izračun bez pada, stranica rasporeda brzo", async () => {
    const { firma, model, u } = await pripremi();
    const N = 2000;
    const uredaji = Array.from({ length: N }, (_, i) => ({
      id: randomUUID(),
      firmaId: firma.id,
      serijski: `V-${String(i).padStart(5, "0")}`,
      modelId: model.id,
      stanje: "U_NAJMU" as const,
      skladisteId: null,
    }));
    await prisma.uredaj.createMany({ data: uredaji });
    const planovi = uredaji.map((x) => ({ id: randomUUID(), firmaId: firma.id, ugovorId: u, uredajId: x.id, od: new Date("2024-01-01T00:00:00Z") }));
    await prisma.uredajNaUgovoru.createMany({ data: planovi });
    await prisma.cijenaNajma.createMany({
      data: planovi.map((p) => ({ firmaId: firma.id, planId: p.id, od: new Date("2024-01-01T00:00:00Z"), iznos: "25.00" })),
    });
    const rate = planovi.flatMap((p) =>
      Array.from({ length: 25 }, (_, m) => ({
        firmaId: firma.id,
        planId: p.id,
        mjesec: new Date(Date.UTC(2024, m, 1)),
        iznos: "25.00",
      })),
    );
    for (let i = 0; i < rate.length; i += 10_000) await prisma.rataNajma.createMany({ data: rate.slice(i, i + 10_000) });
    expect(await prisma.rataNajma.count({ where: { firmaId: firma.id } })).toBe(50_000);

    const t0 = performance.now();
    const n = await podaciZaNaplatu(prisma, firma.id, u);
    const za = zaIzdati(n.uvjeti, n.motor, n.fakturirano, "2026-03");
    const t1 = performance.now();
    // 2024-01 … 2026-01 izdano (25 mjeseci); ostaju veljača i ožujak 2026. za svaki uređaj
    expect(za).toHaveLength(2 * N);
    expect(t1 - t0).toBeLessThan(15_000);

    const t2 = performance.now();
    const s = await podaciZaNaplatu(prisma, firma.id, u, { skip: 1900, take: 100 });
    s.motor.forEach((p) => rateUredaja(s.uvjeti, p, s.fakturirano, "2026-12"));
    expect(s.planovi).toHaveLength(100);
    expect(performance.now() - t2).toBeLessThan(3_000);
  }, 120_000);
});
