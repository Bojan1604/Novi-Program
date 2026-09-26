import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { UlaznaStavka } from "@/domain/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { izdajRacun, spremiNacrt, type UlazDokumenta } from "./prodaja";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await prisma.firma.update({
    where: { id: firma.id },
    data: { oznakaProstora: "UR1", oznakaUredaja: "2", iban: "HR1210010051863000160", adresa: "Ilica 1" },
  });
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Prodavač", ime: "Petra" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "Latitude", proizvodjacId: p.id, kategorijaId: kat.id, kpdProdaja: "26.20.11", kpdNajam: "77.33.11" },
  });
  const usluga = await prisma.usluga.create({ data: { firmaId: firma.id, naziv: "Dostava", cijena: "10.00" } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o.", oib: "69435151530" } });
  const uredaji = await Promise.all(
    ["R-001", "R-002", "R-003"].map((serijski) =>
      prisma.uredaj.create({ data: { firmaId: firma.id, serijski, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skl.id } }),
    ),
  );
  const uStavka = (i: number, cijena = 100000): UlaznaStavka => ({
    vrsta: "UREDAJ",
    namjena: "PRODAJA",
    uredajId: uredaji[i]!.id,
    modelId: model.id,
    naziv: "Dell Latitude",
    kpd: "26.20.11",
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
    datum: "2026-09-25",
    vrijediDo: null,
    dospijece: "2026-10-10",
    popust: 0,
    napomena: null,
    stavke,
    ...x,
  });
  return { firma, A, kupac, uredaji, uStavka, ulaz, usluga };
}

describe("izdavanje računa", () => {
  it("isti model = jedna stavka; broj redni/prostor/uređaj; uređaji prodani s računom u povijesti; snimka", async () => {
    const { A, uredaji, uStavka, ulaz, usluga, firma, kupac } = await pripremi();
    const n = await spremiNacrt(
      prisma,
      A,
      null,
      ulaz([
        uStavka(0),
        uStavka(1),
        {
          vrsta: "USLUGA",
          namjena: "PRODAJA",
          uslugaId: usluga.id,
          naziv: "Dostava",
          kpd: "49.41.19",
          jedinica: "kom",
          kolicina: 1000,
          cijena: 1000,
          popust: 0,
          stopa: 2500,
        },
        uStavka(2, 90000),
      ]),
    );
    const { broj } = await izdajRacun(prisma, A, n.id, SADA);
    expect(broj).toBe("1/UR1/2");
    const r = await prisma.prodajniDokument.findUniqueOrThrow({
      where: { id: n.id },
      include: { stavke: { orderBy: { redoslijed: "asc" }, include: { uredaji: { include: { uredaj: true } } } } },
    });
    expect(r.stavke.map((s) => [s.naziv, s.kolicina, s.opis, s.uredaji.map((u) => u.uredaj.serijski).sort()])).toEqual([
      ["Dell Latitude", 2000, "S/N: R-001, R-002", ["R-001", "R-002"]],
      ["Dostava", 1000, null, []],
      ["Dell Latitude", 1000, "S/N: R-003", ["R-003"]],
    ]);
    // 2.000 + 10 + 900 = 2.910,00; PDV 727,50
    expect([r.osnovica.toFixed(2), r.pdv.toFixed(2), r.ukupno.toFixed(2)]).toEqual(["2910.00", "727.50", "3637.50"]);
    for (const u of uredaji) {
      expect(await prisma.uredaj.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({
        stanje: "PRODAN",
        partnerId: kupac.id,
        skladisteId: null,
      });
    }
    expect(await prisma.dogadajUredaja.count({ where: { dokumentId: n.id, radnja: "prodaja", dokumentBroj: "1/UR1/2" } })).toBe(3);
    // promjena postavki ne mijenja izdani račun
    await prisma.firma.update({ where: { id: firma.id }, data: { iban: "HR0000000000000000000", oznakaProstora: "NOVO" } });
    const s = (await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id } })).snimka as {
      firma: { iban: string };
      racun: { oznakaProstora: string };
    };
    expect(s.firma.iban).toBe("HR1210010051863000160");
    expect(s.racun.oznakaProstora).toBe("UR1");
    await expect(izdajRacun(prisma, A, n.id, SADA)).rejects.toThrow("već izdan");
  });

  it("KPD obavezan; prodan uređaj ne može na drugi račun; bez kupca nema prodaje uređaja; neuspjeh ne troši broj", async () => {
    const { A, uStavka, ulaz } = await pripremi();
    const bezKpd = await spremiNacrt(
      prisma,
      A,
      null,
      ulaz([{ vrsta: "RUCNA", namjena: "PRODAJA", naziv: "Kabel", jedinica: "kom", kolicina: 1000, cijena: 500, popust: 0, stopa: 2500 }]),
    );
    await expect(izdajRacun(prisma, A, bezKpd.id, SADA)).rejects.toThrow("bez ispravne KPD oznake");
    const bezKupca = await spremiNacrt(prisma, A, null, ulaz([uStavka(0)], { partnerId: null }));
    await expect(izdajRacun(prisma, A, bezKupca.id, SADA)).rejects.toThrow("odaberite kupca");
    const a = await spremiNacrt(prisma, A, null, ulaz([uStavka(0)]));
    const b = await spremiNacrt(prisma, A, null, ulaz([uStavka(0)]));
    expect((await izdajRacun(prisma, A, a.id, SADA)).broj).toBe("1/UR1/2");
    await expect(izdajRacun(prisma, A, b.id, SADA)).rejects.toThrow("Prodan");
    const c = await spremiNacrt(prisma, A, null, ulaz([uStavka(1)]));
    expect((await izdajRacun(prisma, A, c.id, SADA)).broj).toBe("2/UR1/2");
  });

  it("dvije kartice izdaju isti nacrt istovremeno → jedan račun, jedan broj", async () => {
    const { A, uStavka, ulaz } = await pripremi();
    const n = await spremiNacrt(prisma, A, null, ulaz([uStavka(0)]));
    const r = await Promise.allSettled([izdajRacun(prisma, A, n.id, SADA), izdajRacun(prisma, A, n.id, SADA)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.brojac.findFirstOrThrow({ where: { vrsta: "racun:UR1:2" } })).toMatchObject({ zadnji: 1 });
  });

  it("najam uređaja na računu: uređaj ide u najam na ugovoru (korak 3.8), ne prodaje se; KPD najma", async () => {
    const { A, uStavka, ulaz, uredaji } = await pripremi();
    const n = await spremiNacrt(prisma, A, null, ulaz([{ ...uStavka(0, 5000), namjena: "NAJAM", kpd: "77.33.11" }]));
    await izdajRacun(prisma, A, n.id, SADA);
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: uredaji[0]!.id } })).stanje).toBe("U_NAJMU");
    expect((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id } })).ugovorNajmaId).toBeTruthy();
    const s = await prisma.stavkaProdajnogDokumenta.findFirstOrThrow({ where: { dokumentId: n.id } });
    expect(s).toMatchObject({ vrstaIsporuke: "USLUGA", kpd: "77.33.11" });
  });
});
