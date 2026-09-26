import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { dodajUredajeNaUgovor, izdajRate, otkaziUgovor, pauzirajUgovor, podaciZaNaplatu, spremiUgovor, visakUgovora, vratiUredaj } from "./najam";
import { napraviZadaneSifrarnike } from "./sifrarnici";

/** Primjeri iz motora naplate (3.1) kroz stvarne radnje: izdavanje, povrat, otkaz, pauza. */
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
  await prisma.uredaj.create({ data: { firmaId: firma.id, serijski: "P-1", modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id } });
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
  });
  if (!r.ok) throw new Error("ugovor");
  await dodajUredajeNaUgovor(prisma, A, r.id, { serijski: ["P-1"], od: "2026-01-01", cijena: 10000, izvor: "SKLADISTE" });
  const plan = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId: r.id } });
  const osnovica = async (id: string) => (await prisma.prodajniDokument.findUniqueOrThrow({ where: { id } })).osnovica.toFixed(2);
  return { firma, A, skl, u: r.id, plan, osnovica };
}

describe("pauza, otkaz, povrat kroz radnje", () => {
  it("povrat 10.2. nakon izdane veljače: uređaj na skladištu, višak 64,29 € za odobrenje; ožujak se ne naplaćuje", async () => {
    const { A, skl, u, plan, firma, osnovica } = await pripremi();
    const r = await izdajRate(prisma, A, u, "2026-02", new Date("2026-02-05T09:00:00Z"));
    expect(await osnovica(r.id)).toBe("200.00");
    const v = await vratiUredaj(prisma, A, u, plan.id, "2026-02-10", skl.id);
    // veljača: 10/28 × 100,00 = 35,71 → višak 64,29
    expect(v).toEqual({ visak: 6429, mjeseci: [{ mjesec: "2026-02", razlika: 6429 }] });
    expect(await prisma.uredaj.findFirstOrThrow({ where: { firmaId: firma.id, serijski: "P-1" } })).toMatchObject({
      stanje: "NA_SKLADISTU",
      partnerId: null,
    });
    const n = await podaciZaNaplatu(prisma, firma.id, u);
    expect(visakUgovora(n).map((x) => [x.mjesec, x.razlika, x.dokumentId])).toEqual([["2026-02", 6429, r.id]]);
    await expect(izdajRate(prisma, A, u, "2026-06", new Date("2026-06-01T09:00:00Z"))).rejects.toThrow("Nema rata");
    await expect(vratiUredaj(prisma, A, u, plan.id, "2026-02-11", skl.id)).rejects.toThrow("već vraćen");
  });

  it("otkaz 14.2. prije izdavanja: veljača 50,00 (14/28), dalje ništa", async () => {
    const { A, u, osnovica } = await pripremi();
    await otkaziUgovor(prisma, A, u, "2026-02-14", "zatvaranje");
    const r = await izdajRate(prisma, A, u, "2026-06", new Date("2026-06-01T09:00:00Z"));
    expect(await osnovica(r.id)).toBe("150.00");
  });

  it("pauza: rate prije pauze ostaju, pauzirani mjeseci se ne naplaćuju, izdani mjesec se ne može pauzirati", async () => {
    const { A, u, osnovica } = await pripremi();
    const jan = await izdajRate(prisma, A, u, "2026-01", new Date("2026-01-20T09:00:00Z"));
    await expect(pauzirajUgovor(prisma, A, u, "2026-01", "2026-02", true)).rejects.toThrow("već izdane: P-1 01/2026");
    expect(await pauzirajUgovor(prisma, A, u, "2026-02", "2026-03", true)).toBe(1);
    const r = await izdajRate(prisma, A, u, "2026-04", new Date("2026-04-02T09:00:00Z"));
    expect(await osnovica(jan.id)).toBe("100.00");
    expect(await osnovica(r.id)).toBe("100.00"); // samo travanj
    // ukidanje pauze za neizdane mjesece vraća naplatu
    await pauzirajUgovor(prisma, A, u, "2026-02", "2026-03", false);
    const r2 = await izdajRate(prisma, A, u, "2026-04", new Date("2026-04-03T09:00:00Z"));
    expect(await osnovica(r2.id)).toBe("200.00");
  });

  it("otkaz nakon izdanih mjeseci: višak za cijele mjesece nakon otkaza", async () => {
    const { A, u, firma } = await pripremi();
    await izdajRate(prisma, A, u, "2026-03", new Date("2026-03-01T09:00:00Z"));
    await otkaziUgovor(prisma, A, u, "2026-01-31", null);
    const n = await podaciZaNaplatu(prisma, firma.id, u);
    expect(visakUgovora(n).map((x) => [x.mjesec, x.razlika])).toEqual([
      ["2026-02", 10000],
      ["2026-03", 10000],
    ]);
  });
});
