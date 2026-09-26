import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { automatskoIzdavanje, dodajUredajeNaUgovor, postaviAutomatsko, spremiUgovor } from "./najam";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Prodavač" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Najmoprimac d.o.o.", oib: "69435151530" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "LaserJet", proizvodjacId: p.id, kategorijaId: kat.id, kpdProdaja: "28.23.21", kpdNajam: "77.33.11" },
  });
  await prisma.uredaj.create({ data: { firmaId: firma.id, serijski: "A-1", modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id } });
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
  await dodajUredajeNaUgovor(prisma, A, r.id, { serijski: ["A-1"], od: "2026-01-01", cijena: 10000, izvor: "SKLADISTE" });
  return { firma, A, u: r.id, k };
}

const racuni = (firmaId: string) =>
  prisma.prodajniDokument.findMany({ where: { firmaId }, orderBy: { stvoreno: "asc" }, include: { stavke: { select: { naziv: true } } } });

describe("automatsko izdavanje najma", () => {
  it("samo od dana uključivanja; drugo pokretanje ne izdaje ništa; sljedeći mjesec opet jednom", async () => {
    const { A, u, firma } = await pripremi();
    // prije uključivanja ništa
    expect(await automatskoIzdavanje(prisma, new Date("2026-03-15T06:00:00Z"))).toEqual({ izdano: 0, greske: [] });
    await postaviAutomatsko(prisma, A, u, true, new Date("2026-03-15T08:00:00Z"));
    // siječanj i veljača (prije uključivanja) se ne izdaju automatski, samo ožujak
    expect(await automatskoIzdavanje(prisma, new Date("2026-03-15T09:00:00Z"))).toEqual({ izdano: 1, greske: [] });
    expect(await automatskoIzdavanje(prisma, new Date("2026-03-15T10:00:00Z"))).toEqual({ izdano: 0, greske: [] });
    await expect(racuni(firma.id)).resolves.toMatchObject([{ stavke: [{ naziv: "Najam HP LaserJet 03/2026" }] }]);
    // travanj: sam, jednom, s datumom dana izdavanja
    await Promise.all([automatskoIzdavanje(prisma, new Date("2026-04-01T05:00:00Z")), automatskoIzdavanje(prisma, new Date("2026-04-01T05:00:00Z"))]);
    const r = await racuni(firma.id);
    expect(r).toHaveLength(2);
    expect(r[1]!.stavke.map((s) => s.naziv)).toEqual(["Najam HP LaserJet 04/2026"]);
    expect(r[1]!.datum.toISOString().slice(0, 10)).toBe("2026-04-01");
    // isključeno: ništa
    await postaviAutomatsko(prisma, A, u, false);
    expect(await automatskoIzdavanje(prisma, new Date("2026-05-02T05:00:00Z"))).toEqual({ izdano: 0, greske: [] });
  });

  it("korisnik koji je uključio izdavanje izgubio je pravo: ne izdaje se, greška se vidi na ugovoru", async () => {
    const { A, u, firma, k } = await pripremi();
    await postaviAutomatsko(prisma, A, u, true, new Date("2026-03-15T08:00:00Z"));
    await prisma.clanstvoFirme.updateMany({ where: { firmaId: firma.id, korisnikId: k.id }, data: { aktivno: false } });
    const a = await automatskoIzdavanje(prisma, new Date("2026-03-15T09:00:00Z"));
    expect(a.izdano).toBe(0);
    expect(a.greske[0]).toContain("više nema pravo");
    expect((await prisma.ugovorNajma.findUniqueOrThrow({ where: { id: u } })).automatskiGreska).toContain("više nema pravo");
    expect(await prisma.prodajniDokument.count({ where: { firmaId: firma.id } })).toBe(0);
  });
});
