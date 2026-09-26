import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { UlaznaStavka } from "@/domain/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { dodajUredajeNaUgovor, izdajRate, spremiUgovor } from "./najam";
import { postaviUgovorNacrta } from "./najam-racun";
import { izdajRacun, spremiNacrt, stornirajRacun, type UlazDokumenta } from "./prodaja";
import { napraviZadaneSifrarnike } from "./sifrarnici";

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
  const stavka = (uredajId: string, namjena: "PRODAJA" | "NAJAM", cijena: number): UlaznaStavka => ({
    vrsta: "UREDAJ",
    namjena,
    uredajId,
    modelId: model.id,
    naziv: "HP LaserJet",
    kpd: namjena === "NAJAM" ? "77.33.11" : "28.23.21",
    jedinica: "kom",
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
    datum: "2026-03-10",
    vrijediDo: null,
    dospijece: null,
    popust: 0,
    napomena: null,
    stavke,
    ...x,
  });
  const ugovor = async (partnerId = kupac.id) => {
    const r = await spremiUgovor(prisma, A, null, {
      partnerId,
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
    return r.id;
  };
  return { firma, A, uredaj, stavka, ulaz, ugovor, drugi };
}

describe("račun za najam iz prodaje", () => {
  it("miješani račun prodaja + najam bez ugovora: otvara se novi ugovor, rata za mjesec računa", async () => {
    const { A, uredaj, stavka, ulaz, firma } = await pripremi();
    const [a, b] = await Promise.all([uredaj("M-A"), uredaj("M-B")]);
    const n = await spremiNacrt(prisma, A, null, ulaz([stavka(a.id, "PRODAJA", 100000), stavka(b.id, "NAJAM", 4000)]));
    await izdajRacun(prisma, A, n.id, SADA);
    const d = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id } });
    expect(d.ugovorNajmaId).toBeTruthy();
    const ug = await prisma.ugovorNajma.findUniqueOrThrow({ where: { id: d.ugovorNajmaId! } });
    expect([ug.broj, ug.od.toISOString().slice(0, 10), ug.uvjeti]).toEqual(["NU-1/2026", "2026-03-10", `Otvoren računom ${d.broj}.`]);
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: a.id } })).stanje).toBe("PRODAN");
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: b.id } })).stanje).toBe("U_NAJMU");
    const rate = await prisma.rataNajma.findMany({ where: { firmaId: firma.id } });
    expect(rate.map((r) => [r.mjesec.toISOString().slice(0, 7), r.iznos.toFixed(2), r.dokumentId])).toEqual([["2026-03", "40.00", n.id]]);
    // sljedeći mjesec: rata ugovora (ožujak je već naplaćen računom iz prodaje)
    const r2 = await izdajRate(prisma, A, ug.id, "2026-04", new Date("2026-04-02T09:00:00Z"));
    expect((await prisma.stavkaProdajnogDokumenta.findMany({ where: { dokumentId: r2.id } })).map((s) => [s.naziv, s.cijena.toFixed(2)])).toEqual([
      ["Najam HP LaserJet 04/2026", "40.00"],
    ]);
  });

  it("rata se ne može naplatiti dvaput: već izdana rata ugovora → račun iz prodaje odbijen, broj se ne troši; storno oslobađa ratu", async () => {
    const { A, uredaj, stavka, ulaz, ugovor, firma } = await pripremi();
    const b = await uredaj("D-B");
    const u = await ugovor();
    await dodajUredajeNaUgovor(prisma, A, u, { serijski: ["D-B"], od: "2026-01-01", cijena: 4000, izvor: "SKLADISTE" });
    const rate = await izdajRate(prisma, A, u, "2026-03", SADA);
    const n = await spremiNacrt(prisma, A, null, ulaz([stavka(b.id, "NAJAM", 4000)]));
    await postaviUgovorNacrta(prisma, A, n.id, u);
    const broj = (await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: rate.id } })).broj;
    await expect(izdajRacun(prisma, A, n.id, SADA)).rejects.toThrow(`je već naplaćen (račun ${broj})`);
    expect((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("NACRT");
    // storno računa rata oslobađa ožujak → račun iz prodaje sada prolazi
    const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
    await stornirajRacun(prisma, A, rate.id, skl.id, SADA);
    await izdajRacun(prisma, A, n.id, SADA);
    expect(await prisma.rataNajma.count({ where: { firmaId: firma.id, dokumentId: n.id } })).toBe(1);
    // i ugovor sada za ožujak nema što izdati (siječanj i veljača su ponovno za izdati nakon storna)
    const r3 = await izdajRate(prisma, A, u, "2026-03", SADA);
    expect((await prisma.stavkaProdajnogDokumenta.findMany({ where: { dokumentId: r3.id } })).map((s) => s.naziv).sort()).toEqual([
      "Najam HP LaserJet 01/2026",
      "Najam HP LaserJet 02/2026",
    ]);
  });

  it("ugovor drugog kupca se ne može odabrati", async () => {
    const { A, uredaj, stavka, ulaz, ugovor, drugi } = await pripremi();
    const b = await uredaj("X-B");
    const tudji = await ugovor(drugi.id);
    const n = await spremiNacrt(prisma, A, null, ulaz([stavka(b.id, "NAJAM", 4000)]));
    await expect(postaviUgovorNacrta(prisma, A, n.id, tudji)).rejects.toThrow("nije ovog kupca");
  });
});
