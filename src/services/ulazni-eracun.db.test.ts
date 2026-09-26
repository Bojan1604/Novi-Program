import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { demoPrimiUlazni } from "@/lib/eracun/posrednik";
import { ublXml } from "@/lib/eracun/ubl";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { spremiNarudzbenicu, zaprimiPoNarudzbenici } from "./nabava";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { demoPrimjerERacuna, odbijERacun, platiUlazni, preuzmiERacune, prihvatiERacun, trosakPoNarudzbenici } from "./ulazni-racuni";

const prisma = testnaPrisma();
const zn = (v: string) => (v === "ODOBRENJE" ? -1 : 1);
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const dob = await prisma.partner.create({
    data: { firmaId: firma.id, naziv: "Dobavljač d.o.o.", oib: "94577403194", kupac: false, dobavljac: true },
  });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const m = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "Latitude", proizvodjacId: p.id, kategorijaId: kat.id } });
  const eRacun = (broj: string, osnovica: number, kupacOib = firma.oib, vrsta: "RACUN" | "ODOBRENJE" = "RACUN") =>
    ublXml({
      vrsta,
      broj,
      datum: "2026-09-24",
      vrijeme: "10:00:00",
      dospijece: "2026-10-24",
      prodavatelj: {
        naziv: "Dobavljač d.o.o.",
        oib: "94577403194",
        pdvBroj: null,
        adresa: "A 1",
        postanskiBroj: "10000",
        mjesto: "Zagreb",
        drzava: "HR",
        uSustavuPdv: true,
        iban: "HR1210010051863000160",
      },
      operater: { ime: "X", oib: "94577403194" },
      kupac: { naziv: "Mi", oib: kupacOib, pdvBroj: null, adresa: null, postanskiBroj: null, mjesto: null, drzava: "HR" },
      izvorni: vrsta === "ODOBRENJE" ? { broj: "R-1", datum: "2026-09-24" } : null,
      nacinPlacanja: "T",
      pozivNaBroj: null,
      napomene: [],
      stavke: [
        {
          naziv: "Laptop",
          opis: null,
          kpd: "26.20.11",
          jedinica: "kom",
          kolicina: zn(vrsta) * 1000,
          cijena: osnovica,
          iznos: zn(vrsta) * osnovica,
          ublKod: "S",
          stopa: 2500,
        },
      ],
      // naša konvencija: odobrenje s negativnim iznosima (u XML-u CreditNote su pozitivni)
      poKategoriji: [{ ublKod: "S", stopa: 2500, osnovica: zn(vrsta) * osnovica, pdv: (zn(vrsta) * osnovica) / 4, vatex: null, tekst: null }],
      osnovica: zn(vrsta) * osnovica,
      pdv: (zn(vrsta) * osnovica) / 4,
      ukupno: zn(vrsta) * (osnovica + osnovica / 4),
      pdf: null,
    });
  return { firma, A, skl, dob, m, eRacun };
}

describe("ulazni eRačun", () => {
  it("preuzimanje (jednom), prihvat uz narudžbenicu knjiži samo razliku iznad primke, plaćanje tek nakon prihvata", async () => {
    const { A, skl, dob, m, eRacun, firma } = await pripremi();
    const n = await spremiNarudzbenicu(prisma, A, null, {
      datum: "2026-09-20",
      dobavljacId: dob.id,
      napomena: null,
      verzija: 0,
      stavke: [{ modelId: m.id, kolicina: 1, cijena: 100000 }],
    });
    const st = await prisma.stavkaNarudzbenice.findFirstOrThrow({ where: { narudzbenicaId: n.id } });
    await zaprimiPoNarudzbenici(
      prisma,
      A,
      n.id,
      { datum: "2026-09-25", skladisteId: skl.id, dokumentDobavljaca: null, knjiziUTroskove: true, stavke: [{ stavkaId: st.id, serijski: ["E-1"] }] },
      SADA,
    );
    demoPrimiUlazni(firma.oib, eRacun("R-1", 108000));
    demoPrimiUlazni(firma.oib, eRacun("TUDJI", 5000, "69435151530"));
    const p = await preuzmiERacune(prisma, A);
    expect(p.preuzeto).toBe(1);
    expect(p.preskoceno[0]).toContain("nije za ovu firmu");
    expect(await preuzmiERacune(prisma, A)).toEqual({ preuzeto: 0, preskoceno: [] });
    const u = await prisma.ulazniRacun.findFirstOrThrow({ where: { firmaId: firma.id } });
    expect(u).toMatchObject({ status: "PRIMLJEN", izvor: "ERACUN", broj: "R-1", dobavljacId: dob.id, zaRobu: false });
    expect([u.osnovica.toFixed(2), u.ukupno.toFixed(2)]).toEqual(["1080.00", "1350.00"]);
    await expect(platiUlazni(prisma, A, u.id, { datum: "2026-09-25", iznos: 1000 })).rejects.toThrow("tek nakon prihvata");
    expect(await prihvatiERacun(prisma, A, u.id, { narudzbenicaId: n.id, primkaId: null, zaRobu: true })).toEqual({ razlikaRobe: 8000 });
    expect(await trosakPoNarudzbenici(prisma, firma.id, n.id)).toMatchObject({ roba: 108000, izvor: "RACUNI" });
    await expect(prihvatiERacun(prisma, A, u.id, { narudzbenicaId: null, primkaId: null, zaRobu: true })).rejects.toThrow("već obrađen");
    await platiUlazni(prisma, A, u.id, { datum: "2026-09-25", iznos: 100000 });
    await expect(platiUlazni(prisma, A, u.id, { datum: "2026-09-25", iznos: 40000 })).rejects.toThrow("otvoreno");
    expect((await prisma.ulazniRacun.findUniqueOrThrow({ where: { id: u.id } })).placeno.toFixed(2)).toBe("1000.00");
  });

  it("odbijanje s razlogom: status, izvještaj Poreznoj, ne ulazi u trošak i ne plaća se", async () => {
    const { A, firma, eRacun } = await pripremi();
    demoPrimiUlazni(firma.oib, eRacun("R-2", 20000));
    await preuzmiERacune(prisma, A);
    const u = await prisma.ulazniRacun.findFirstOrThrow({ where: { firmaId: firma.id } });
    await expect(odbijERacun(prisma, A, u.id, "x")).rejects.toThrow("razlog");
    await odbijERacun(prisma, A, u.id, "Pogrešna količina");
    const o = await prisma.ulazniRacun.findUniqueOrThrow({ where: { id: u.id } });
    expect(o).toMatchObject({ status: "ODBIJEN", razlogOdbijanja: "Pogrešna količina" });
    expect(o.izvjestajId).toMatch(/^DEMO-IZ-/);
    await expect(platiUlazni(prisma, A, u.id, { datum: "2026-09-25", iznos: 100 })).rejects.toThrow("ne plaća");
  });

  it("odobrenje dobavljača ima negativne iznose; demo primjer", async () => {
    const { A, firma, eRacun } = await pripremi();
    demoPrimiUlazni(firma.oib, eRacun("OD-1", 10000, firma.oib, "ODOBRENJE"));
    await demoPrimjerERacuna(prisma, A, SADA);
    expect((await preuzmiERacune(prisma, A)).preuzeto).toBe(2);
    const r = await prisma.ulazniRacun.findMany({ where: { firmaId: firma.id }, orderBy: { redni: "asc" } });
    expect(r.map((x) => [x.broj.startsWith("DEMO-") ? "DEMO" : x.broj, x.osnovica.toFixed(2)])).toEqual([
      ["OD-1", "-100.00"],
      ["DEMO", "100.00"],
    ]);
  });
});
