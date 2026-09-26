import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { UlaznaStavka } from "@/domain/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { dodajPredujam, dostupniPredujmovi, izdajRacun, spremiNacrt, uUlaznu, type UlazDokumenta } from "./prodaja";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");
const stavka = (cijena: number): UlaznaStavka => ({
  vrsta: "RUCNA",
  namjena: "PRODAJA",
  naziv: "Oprema",
  kpd: "26.20.11",
  jedinica: "kom",
  kolicina: 1000,
  cijena,
  popust: 0,
  stopa: 2500,
});

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac" } });
  const ulaz = (vrsta: string, stavke: UlaznaStavka[]): UlazDokumenta => ({
    vrsta,
    verzija: 0,
    partnerId: kupac.id,
    poslovnicaId: null,
    datum: "2026-09-25",
    vrijediDo: null,
    dospijece: null,
    popust: 0,
    napomena: null,
    stavke,
  });
  const izdaj = async (vrsta: string, stavke: UlaznaStavka[]) => {
    const n = await spremiNacrt(prisma, A, null, ulaz(vrsta, stavke));
    await izdajRacun(prisma, A, n.id, SADA);
    return n.id;
  };
  return { A, kupac, ulaz, izdaj };
}

describe("predujam", () => {
  it("predujam 400 + PDV; konačni 1.000: odbitak po stopi PDV-a, ostatak se ne može iskoristiti dvaput", async () => {
    const { A, kupac, ulaz, izdaj } = await pripremi();
    const pred = await izdaj("PREDUJAM", [stavka(40000)]);
    expect((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: pred } })).broj).toBe("1/PP1/1");
    const kon = await spremiNacrt(prisma, A, null, ulaz("RACUN", [stavka(100000)]));
    await dodajPredujam(prisma, A, kon.id, pred);
    await expect(dodajPredujam(prisma, A, kon.id, pred)).rejects.toThrow("već iskorišten ili dodan");
    await izdajRacun(prisma, A, kon.id, SADA);
    const r = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: kon.id }, include: { stavke: { orderBy: { redoslijed: "asc" } } } });
    // 1.000 − 400 = 600 osnovica, PDV 150, ukupno 750
    expect([r.osnovica.toFixed(2), r.pdv.toFixed(2), r.ukupno.toFixed(2)]).toEqual(["600.00", "150.00", "750.00"]);
    expect(r.stavke[1]).toMatchObject({ vrsta: "PREDUJAM", naziv: "Predujam po računu 1/PP1/1", kolicina: -1000 });
    expect((await dostupniPredujmovi(prisma, A.firmaId, kupac.id, null))[0]).toMatchObject({ osnovica: 40000, iskoristeno: 40000 });
    const drugi = await spremiNacrt(prisma, A, null, ulaz("RACUN", [stavka(100000)]));
    await expect(dodajPredujam(prisma, A, drugi.id, pred)).rejects.toThrow("već iskorišten");
  });

  it("predujam veći od računa odbijen; ručno povećan odbitak odbijen; djelomično iskorištenje", async () => {
    const { A, ulaz, izdaj } = await pripremi();
    const pred = await izdaj("PREDUJAM", [stavka(40000)]);
    const mali = await spremiNacrt(prisma, A, null, ulaz("RACUN", [stavka(30000)]));
    await dodajPredujam(prisma, A, mali.id, pred);
    await expect(izdajRacun(prisma, A, mali.id, SADA)).rejects.toThrow("Predujam je veći od računa");
    // korisnik smanji odbitak na 300 → prolazi, ostaje 100 za drugi račun
    const n = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: mali.id }, include: { stavke: { orderBy: { redoslijed: "asc" } } } });
    const stavke = n.stavke.map(uUlaznu);
    await expect(
      spremiNacrt(prisma, A, mali.id, { ...ulaz("RACUN", [stavke[0]!, { ...stavke[1]!, cijena: 50000 }]), verzija: n.verzija }).then(() =>
        izdajRacun(prisma, A, mali.id, SADA),
      ),
    ).rejects.toThrow("preostalih 400,00");
    const n2 = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: mali.id } });
    await spremiNacrt(prisma, A, mali.id, { ...ulaz("RACUN", [stavke[0]!, { ...stavke[1]!, cijena: 30000 }]), verzija: n2.verzija });
    await izdajRacun(prisma, A, mali.id, SADA);
    const drugi = await spremiNacrt(prisma, A, null, ulaz("RACUN", [stavka(100000)]));
    await dodajPredujam(prisma, A, drugi.id, pred);
    const d = await prisma.stavkaProdajnogDokumenta.findFirstOrThrow({ where: { dokumentId: drugi.id, vrsta: "PREDUJAM" } });
    expect(d.cijena.toFixed(2)).toBe("100.00");
  });

  it("dva konačna računa istovremeno ne mogu odbiti isti predujam", async () => {
    const { A, ulaz, izdaj } = await pripremi();
    const pred = await izdaj("PREDUJAM", [stavka(40000)]);
    const a = await spremiNacrt(prisma, A, null, ulaz("RACUN", [stavka(100000)]));
    const b = await spremiNacrt(prisma, A, null, ulaz("RACUN", [stavka(100000)]));
    await dodajPredujam(prisma, A, a.id, pred);
    await dodajPredujam(prisma, A, b.id, pred);
    const r = await Promise.allSettled([izdajRacun(prisma, A, a.id, SADA), izdajRacun(prisma, A, b.id, SADA)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
});
