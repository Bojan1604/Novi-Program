import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { UlaznaStavka } from "@/domain/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { izdajRacun, napraviOdobrenje, spremiNacrt, stornirajRacun, uUlaznu } from "./prodaja";
import { dodajUplatu } from "./uplate";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "Glavno", zadano: true } });
  const povrati = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "Povrati" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.create({ data: { firmaId: firma.id, naziv: "Laptopi" } });
  const model = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "ProBook", proizvodjacId: p.id, kategorijaId: kat.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac" } });
  const u = await Promise.all(
    ["S1", "S2"].map((serijski) =>
      prisma.uredaj.create({ data: { firmaId: firma.id, serijski, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id } }),
    ),
  );
  const uStavka = (i: number): UlaznaStavka => ({
    vrsta: "UREDAJ",
    namjena: "PRODAJA",
    uredajId: u[i]!.id,
    modelId: model.id,
    naziv: "HP ProBook",
    kpd: "26.20.11",
    jedinica: "kom",
    kolicina: 1000,
    cijena: 100000,
    popust: 0,
    stopa: 2500,
  });
  const dostava: UlaznaStavka = {
    vrsta: "RUCNA",
    namjena: "PRODAJA",
    naziv: "Dostava",
    kpd: "53.20.19",
    jedinica: "kom",
    kolicina: 1000,
    cijena: 1000,
    popust: 0,
    stopa: 2500,
    vrstaIsporuke: "USLUGA",
  };
  const n = await spremiNacrt(prisma, A, null, {
    vrsta: "RACUN",
    verzija: 0,
    partnerId: kupac.id,
    poslovnicaId: null,
    datum: "2026-09-25",
    vrijediDo: null,
    dospijece: null,
    popust: 0,
    napomena: null,
    stavke: [uStavka(0), uStavka(1), dostava],
  });
  await izdajRacun(prisma, A, n.id, SADA);
  return { A, racunId: n.id, u, skl, povrati };
}

describe("storno", () => {
  it("storno u istom nizu brojeva, uređaji na odabrano skladište, uplata postaje za povrat", async () => {
    const { A, racunId, u, povrati } = await pripremi();
    await dodajUplatu(prisma, A, racunId, { datum: "2026-09-25", iznos: 50000, nacin: "T", opis: null }, SADA);
    const s = await stornirajRacun(prisma, A, racunId, povrati.id, SADA);
    expect(s.broj).toBe("2/PP1/1");
    const [racun, storno] = await Promise.all([
      prisma.prodajniDokument.findUniqueOrThrow({ where: { id: racunId } }),
      prisma.prodajniDokument.findUniqueOrThrow({ where: { id: s.id }, include: { stavke: true } }),
    ]);
    expect(racun.status).toBe("STORNIRAN");
    expect(storno.ukupno.toFixed(2)).toBe(racun.ukupno.negated().toFixed(2));
    expect(storno.stavke.every((x) => x.kolicina < 0)).toBe(true);
    for (const x of u)
      expect(await prisma.uredaj.findUniqueOrThrow({ where: { id: x.id } })).toMatchObject({
        stanje: "NA_SKLADISTU",
        skladisteId: povrati.id,
        partnerId: null,
      });
    // plaćeno 500,00 po stornom računu → povrat kupcu dopušten do 500,00
    await expect(dodajUplatu(prisma, A, racunId, { datum: "2026-09-25", iznos: -50001, nacin: "T", opis: null }, SADA)).rejects.toThrow(
      "najviše 500,00",
    );
    expect(await dodajUplatu(prisma, A, racunId, { datum: "2026-09-25", iznos: -50000, nacin: "T", opis: null }, SADA)).toMatchObject({
      status: "PLACEN",
    });
    await expect(stornirajRacun(prisma, A, racunId, povrati.id, SADA)).rejects.toThrow("već storniran");
    await expect(napraviOdobrenje(prisma, A, racunId, SADA)).rejects.toThrow("izdani račun");
  });
});

describe("odobrenje", () => {
  it("jedan uređaj i dostava: ostatak se ne može prijeći, vraćeni uređaj na skladištu; storno nakon odobrenja nije moguć", async () => {
    const { A, racunId, u, skl, povrati } = await pripremi();
    const o = await napraviOdobrenje(prisma, A, racunId, SADA);
    const nacrt = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: o.id }, include: { stavke: { orderBy: { redoslijed: "asc" } } } });
    expect(nacrt.stavke.map((s) => [s.opis, s.kolicina])).toEqual([
      ["S/N: S1", -1000],
      ["S/N: S2", -1000],
      [null, -1000],
    ]);
    // vraća se samo S1
    await spremiNacrt(prisma, A, o.id, {
      vrsta: "ODOBRENJE",
      verzija: nacrt.verzija,
      partnerId: nacrt.partnerId,
      poslovnicaId: null,
      datum: "2026-09-25",
      vrijediDo: null,
      dospijece: null,
      popust: 0,
      napomena: null,
      stavke: [uUlaznu(nacrt.stavke[0]!)],
    });
    const { broj } = await izdajRacun(prisma, A, o.id, SADA);
    expect(broj).toBe("2/PP1/1");
    expect((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: o.id } })).ukupno.toFixed(2)).toBe("-1250.00");
    expect(await prisma.uredaj.findUniqueOrThrow({ where: { id: u[0]!.id } })).toMatchObject({ stanje: "NA_SKLADISTU", skladisteId: skl.id });
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: u[1]!.id } })).stanje).toBe("PRODAN");
    // drugo odobrenje s istim uređajem → uređaj više nije prodan; s cijelim ostatkom prolazi samo jedno od dva istovremena
    const o2 = await napraviOdobrenje(prisma, A, racunId, SADA);
    await expect(izdajRacun(prisma, A, o2.id, SADA)).rejects.toThrow();
    const n2 = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: o2.id }, include: { stavke: { orderBy: { redoslijed: "asc" } } } });
    const bezS1 = n2.stavke.slice(1).map(uUlaznu);
    const osnova = {
      vrsta: "ODOBRENJE",
      partnerId: n2.partnerId,
      poslovnicaId: null,
      datum: "2026-09-25",
      vrijediDo: null,
      dospijece: null,
      popust: 0,
      napomena: null,
    };
    await spremiNacrt(prisma, A, o2.id, { ...osnova, verzija: n2.verzija, stavke: bezS1 });
    const o3 = await napraviOdobrenje(prisma, A, racunId, SADA);
    const n3 = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: o3.id }, include: { stavke: { orderBy: { redoslijed: "asc" } } } });
    await spremiNacrt(prisma, A, o3.id, { ...osnova, verzija: n3.verzija, stavke: [uUlaznu(n3.stavke[2]!)] });
    const r = await Promise.allSettled([izdajRacun(prisma, A, o2.id, SADA), izdajRacun(prisma, A, o3.id, SADA)]);
    // o2 (S2 + dostava) iscrpi ostatak; o3 (dostava) tada prelazi količinu dostave
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(stornirajRacun(prisma, A, racunId, povrati.id, SADA)).rejects.toThrow("postoje odobrenja");
  });

  it("odobrenje ne smije sadržavati tuđe stavke ni promijeniti kupca", async () => {
    const { A, racunId } = await pripremi();
    const o = await napraviOdobrenje(prisma, A, racunId, SADA);
    const n = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: o.id }, include: { stavke: true } });
    const osnova = {
      vrsta: "ODOBRENJE",
      verzija: n.verzija,
      poslovnicaId: null,
      datum: "2026-09-25",
      vrijediDo: null,
      dospijece: null,
      popust: 0,
      napomena: null,
    };
    await expect(spremiNacrt(prisma, A, o.id, { ...osnova, partnerId: null, stavke: n.stavke.map(uUlaznu) })).rejects.toThrow("isti kao na računu");
    await expect(
      spremiNacrt(prisma, A, o.id, { ...osnova, partnerId: n.partnerId, stavke: [{ ...uUlaznu(n.stavke[0]!), izvornaStavkaId: null }] }),
    ).rejects.toThrow("samo stavke izvornog računa");
  });
});
