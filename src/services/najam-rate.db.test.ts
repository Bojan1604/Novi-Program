import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { dodajUredajeNaUgovor, izdajRate, oznaciIzvanPrograma, spremiUgovor } from "./najam";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-03-10T09:00:00Z");

async function pripremi(kpdNajam: string | null = "77.33.11") {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Prodavač" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Najmoprimac d.o.o.", oib: "69435151530" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Canon" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "iR C3226", proizvodjacId: p.id, kategorijaId: kat.id, kpdProdaja: "28.23.21", kpdNajam },
  });
  for (const s of ["R-1", "R-2", "R-3"])
    await prisma.uredaj.create({ data: { firmaId: firma.id, serijski: s, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id } });
  const r = await spremiUgovor(prisma, A, null, {
    partnerId: kupac.id,
    poslovnicaId: null,
    od: "2026-01-01",
    do: null,
    rucniBroj: null,
    rokPlacanjaDana: 10,
    nacinPlacanja: "T",
    uvjeti: null,
    napomenaRacuna: "Plaćanje do 10. u mjesecu",
    verzija: 0,
  });
  if (!r.ok) throw new Error("ugovor");
  const u = r.id;
  await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["R-1", "R-2"], od: "2026-01-01", cijena: 5000, izvor: "SKLADISTE" });
  await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["R-3"], od: "2026-02-15", cijena: 2800, izvor: "SKLADISTE" });
  return { firma, A, u };
}

describe("rate za izdati", () => {
  it("jedan račun s današnjim datumom: stavke po modelu, mjesecu i iznosu; KPD najma; rate zapisane uz račun", async () => {
    const { A, u, firma } = await pripremi();
    const r = await izdajRate(prisma, A, u, "2026-03", SADA);
    const d = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: r.id }, include: { stavke: { orderBy: { redoslijed: "asc" } } } });
    expect(d).toMatchObject({ status: "IZDAN", ugovorNajmaId: u, broj: "1/PP1/1" });
    expect(d.datum.toISOString().slice(0, 10)).toBe("2026-03-10");
    expect(d.dospijece!.toISOString().slice(0, 10)).toBe("2026-03-20");
    expect(d.napomena).toContain("Plaćanje do 10. u mjesecu");
    expect(d.stavke.map((s) => [s.naziv, s.opis, s.kolicina, s.cijena.toFixed(2), s.namjena, s.kpd])).toEqual([
      ["Najam Canon iR C3226 01/2026", "S/N: R-1, R-2", 2000, "50.00", "NAJAM", "77.33.11"],
      ["Najam Canon iR C3226 02/2026", "S/N: R-1, R-2", 2000, "50.00", "NAJAM", "77.33.11"],
      ["Najam Canon iR C3226 02/2026 (14/28 dana)", "S/N: R-3", 1000, "14.00", "NAJAM", "77.33.11"],
      ["Najam Canon iR C3226 03/2026", "S/N: R-1, R-2", 2000, "50.00", "NAJAM", "77.33.11"],
      ["Najam Canon iR C3226 03/2026", "S/N: R-3", 1000, "28.00", "NAJAM", "77.33.11"],
    ]);
    // 300 + 14 + 28 = 342 + 25 % = 427,50
    expect([d.osnovica.toFixed(2), d.ukupno.toFixed(2)]).toEqual(["342.00", "427.50"]);
    expect(await prisma.rataNajma.count({ where: { firmaId: firma.id, dokumentId: r.id } })).toBe(8);
    // uređaji ostaju u najmu (ne prodaju se)
    expect(await prisma.uredaj.count({ where: { firmaId: firma.id, stanje: "U_NAJMU" } })).toBe(3);
    await expect(izdajRate(prisma, A, u, "2026-03", SADA)).rejects.toThrow("Nema rata za izdati.");
    // sljedeći mjesec: samo travanj
    const r2 = await izdajRate(prisma, A, u, "2026-04", SADA);
    expect((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: r2.id } })).osnovica.toFixed(2)).toBe("128.00");
  });

  it("dvije kartice = jedan račun", async () => {
    const { A, u, firma } = await pripremi();
    const oba = await Promise.allSettled([izdajRate(prisma, A, u, "2026-03", SADA), izdajRate(prisma, A, u, "2026-03", SADA)]);
    expect(oba.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.prodajniDokument.count({ where: { firmaId: firma.id } })).toBe(1);
  });

  it("model bez KPD-a za najam: ništa se ne izdaje i ne troši se broj", async () => {
    const { A, u, firma } = await pripremi(null);
    await expect(izdajRate(prisma, A, u, "2026-03", SADA)).rejects.toThrow("bez KPD oznake za najam");
    expect(await prisma.prodajniDokument.count({ where: { firmaId: firma.id } })).toBe(0);
    expect(await prisma.rataNajma.count()).toBe(0);
    expect(await prisma.brojac.count({ where: { firmaId: firma.id, vrsta: { startsWith: "racun" } } })).toBe(0);
  });

  it("izdano izvan programa se ne izdaje ponovno; vraćanje; rata s računa se ne vraća", async () => {
    const { A, u } = await pripremi();
    const planR1 = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId: u, uredaj: { serijski: "R-1" } } });
    await oznaciIzvanPrograma(prisma, A, u, planR1.id, "2026-01", true);
    await expect(oznaciIzvanPrograma(prisma, A, u, planR1.id, "2026-01", true)).rejects.toThrow("već izdana");
    const r = await izdajRate(prisma, A, u, "2026-01", SADA);
    const d = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: r.id }, include: { stavke: true } });
    expect(d.stavke.map((s) => [s.opis, s.kolicina])).toEqual([["S/N: R-2", 1000]]);
    await expect(oznaciIzvanPrograma(prisma, A, u, planR1.id, "2026-02", false)).rejects.toThrow("nije označena");
    const planR2 = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId: u, uredaj: { serijski: "R-2" } } });
    await expect(oznaciIzvanPrograma(prisma, A, u, planR2.id, "2026-01", false)).rejects.toThrow("odobrenjem");
    await oznaciIzvanPrograma(prisma, A, u, planR1.id, "2026-01", false);
    const r2 = await izdajRate(prisma, A, u, "2026-01", SADA);
    expect((await prisma.stavkaProdajnogDokumenta.findMany({ where: { dokumentId: r2.id } })).map((s) => s.opis)).toEqual(["S/N: R-1"]);
  });
});
