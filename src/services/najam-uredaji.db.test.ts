import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kljucRate, rateUredaja } from "@/domain/najam";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { dodajUredajeNaUgovor, podaciZaNaplatu, postaviCijenu, spremiUgovor, type UlazUgovora } from "./najam";
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
  const drugi = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Drugi d.o.o.", oib: "94577403194" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Canon" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "iR C3226", proizvodjacId: p.id, kategorijaId: kat.id, kpdProdaja: "28.23.21", kpdNajam: "77.33.11" },
  });
  const uredaj = (serijski: string, x: object = {}) =>
    prisma.uredaj.create({ data: { firmaId: firma.id, serijski, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id, ...x } });
  const ugovor = async (x: Partial<UlazUgovora> = {}) => {
    const r = await spremiUgovor(prisma, A, null, {
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
      ...x,
    });
    if (!r.ok) throw new Error(JSON.stringify(r.polja));
    return r.id;
  };
  return { firma, A, kupac, drugi, uredaj, ugovor };
}

describe("uređaji na ugovoru", () => {
  it("sa skladišta: u najmu kod kupca, događaj s ugovorom, plan i cijena od mjeseca početka", async () => {
    const { A, uredaj, ugovor, kupac } = await pripremi();
    const [a, b] = await Promise.all([uredaj("C-1"), uredaj("C-2")]);
    const u = await ugovor();
    expect(await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["c-1", " C-2 ", "C-1"], od: "2026-01-15", cijena: 5000, izvor: "SKLADISTE" })).toBe(
      2,
    );
    for (const x of [a, b])
      expect(await prisma.uredaj.findUniqueOrThrow({ where: { id: x.id } })).toMatchObject({
        stanje: "U_NAJMU",
        partnerId: kupac.id,
        skladisteId: null,
      });
    expect(await prisma.dogadajUredaja.count({ where: { uredajId: a.id, radnja: "najam", dokumentVrsta: "Ugovor o najmu" } })).toBe(1);
    const n = await podaciZaNaplatu(prisma, A.firmaId, u);
    expect(n.motor.map((p) => [p.od, p.cijene])).toEqual([
      ["2026-01-15", [{ od: "2026-01", iznos: 5000 }]],
      ["2026-01-15", [{ od: "2026-01", iznos: 5000 }]],
    ]);
  });

  it("isti uređaj ne može na dva ugovora u istom razdoblju (ni istovremeno); nepostojeći serijski", async () => {
    const { A, uredaj, ugovor, drugi } = await pripremi();
    await uredaj("C-9");
    const [u1, u2] = await Promise.all([ugovor(), ugovor({ partnerId: drugi.id })]);
    const oba = await Promise.allSettled([
      dodajUredajeNaUgovor(prisma, A, u1, { serijski: ["C-9"], od: "2026-01-01", cijena: 1000, izvor: "SKLADISTE" }),
      dodajUredajeNaUgovor(prisma, A, u2, { serijski: ["C-9"], od: "2026-01-01", cijena: 1000, izvor: "SKLADISTE" }),
    ]);
    expect(oba.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.uredajNaUgovoru.count()).toBe(1);
    await expect(dodajUredajeNaUgovor(prisma, A, u1, { serijski: ["NEMA-1"], od: "2026-01-01", cijena: 1000, izvor: "SKLADISTE" })).rejects.toThrow(
      "Nisu u programu: NEMA-1",
    );
  });

  it("od klijenta: uređaj mora biti kod tog klijenta; prethodni plan mora završiti prije", async () => {
    const { A, uredaj, ugovor, kupac, drugi } = await pripremi();
    await uredaj("K-1", { stanje: "PRODAN", skladisteId: null, partnerId: kupac.id });
    await uredaj("K-2", { stanje: "PRODAN", skladisteId: null, partnerId: drugi.id });
    const u = await ugovor();
    await expect(dodajUredajeNaUgovor(prisma, A, u, { serijski: ["K-2"], od: "2026-01-01", cijena: 1000, izvor: "KLIJENT" })).rejects.toThrow(
      "nisu kod ovog klijenta",
    );
    expect(await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["K-1"], od: "2026-01-01", cijena: 1000, izvor: "KLIJENT" })).toBe(1);
    // drugi ugovor istog klijenta: uređaj je još na prvom (bez kraja)
    const u2 = await ugovor();
    await expect(dodajUredajeNaUgovor(prisma, A, u2, { serijski: ["K-1"], od: "2026-06-01", cijena: 1000, izvor: "KLIJENT" })).rejects.toThrow(
      "Već na ugovoru",
    );
    await prisma.uredajNaUgovoru.updateMany({ where: { ugovorId: u }, data: { do: new Date("2026-05-31T00:00:00Z") } });
    expect(await dodajUredajeNaUgovor(prisma, A, u2, { serijski: ["K-1"], od: "2026-06-01", cijena: 1200, izvor: "KLIJENT" })).toBe(1);
  });

  it("promjena samo kraja ugovora ne dira planove; fakturirani mjesec pokazuje iznos s računa; cijena i sezona od prve neizdane rate", async () => {
    const { A, uredaj, ugovor, firma } = await pripremi();
    await uredaj("S-1");
    const u = await ugovor();
    await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["S-1"], od: "2026-01-01", cijena: 10000, izvor: "SKLADISTE" });
    const plan = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId: u } });
    const ug = await prisma.ugovorNajma.findUniqueOrThrow({ where: { id: u } });
    await spremiUgovor(prisma, A, u, {
      partnerId: ug.partnerId,
      poslovnicaId: null,
      od: "2026-01-01",
      do: "2026-12-31",
      rucniBroj: null,
      rokPlacanjaDana: 15,
      nacinPlacanja: "T",
      uvjeti: null,
      napomenaRacuna: null,
      verzija: ug.verzija,
    });
    expect(await prisma.uredajNaUgovoru.findUniqueOrThrow({ where: { id: plan.id } })).toMatchObject({ do: null, od: plan.od });

    // siječanj naplaćen ručno upisanim iznosom 95,00
    await prisma.rataNajma.create({ data: { firmaId: firma.id, planId: plan.id, mjesec: new Date("2026-01-01T00:00:00Z"), iznos: "95.00" } });
    await expect(postaviCijenu(prisma, A, u, { planIds: [plan.id], od: "2026-01", iznos: 12000, doMjeseca: null })).rejects.toThrow(
      "prve neizdane rate (02/2026)",
    );
    // sezona: ožujak–travanj 150,00, zatim natrag 100,00
    await postaviCijenu(prisma, A, u, { planIds: [plan.id], od: "2026-03", iznos: 15000, doMjeseca: "2026-04" });
    const n = await podaciZaNaplatu(prisma, A.firmaId, u);
    expect(n.fakturirano.get(kljucRate(plan.id, "2026-01"))).toBe(9500);
    expect(rateUredaja(n.uvjeti, n.motor[0]!, n.fakturirano, "2026-06").map((r) => [r.mjesec, r.iznos, r.izvor])).toEqual([
      ["2026-01", 9500, "FAKTURIRANO"],
      ["2026-02", 10000, "PLAN"],
      ["2026-03", 15000, "PLAN"],
      ["2026-04", 15000, "PLAN"],
      ["2026-05", 10000, "PLAN"],
      ["2026-06", 10000, "PLAN"],
    ]);
    // trajna nova cijena od lipnja
    await postaviCijenu(prisma, A, u, { planIds: [plan.id], od: "2026-06", iznos: 11000, doMjeseca: null });
    const n2 = await podaciZaNaplatu(prisma, A.firmaId, u);
    expect(
      rateUredaja(n2.uvjeti, n2.motor[0]!, n2.fakturirano, "2026-07")
        .slice(-3)
        .map((r) => r.iznos),
    ).toEqual([10000, 11000, 11000]);
  });
});
