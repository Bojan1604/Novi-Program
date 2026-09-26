import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { praznaPrava, punaPrava } from "@/domain/prava";
import { pregledTroskova } from "@/services/troskovi";
import { napraviFirmu, ocistiBazu, testnaPrisma } from "@/test/baza";
import { izvjestaj } from ".";
import { pokreni } from "./izvrsi";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const DANAS = "2026-09-26";
const d = (x: string) => new Date(`${x}T00:00:00Z`);
const run = async (kljuc: string, firmaId: string, sp: Record<string, string> = {}, prava = punaPrava()) =>
  (await pokreni(izvjestaj(kljuc)!, prisma, firmaId, prava, sp, { skip: 0, take: 1000 }, DANAS)).rezultat;

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const f = firma.id;
  const [a, b] = await Promise.all(["Alfa", "Beta"].map((naziv) => prisma.partner.create({ data: { firmaId: f, naziv } })));
  const p = await prisma.proizvodjac.create({ data: { firmaId: f, naziv: "HP" } });
  const kat = await prisma.kategorija.create({ data: { firmaId: f, naziv: "Laptopi" } });
  const m = await prisma.modelUredaja.create({ data: { firmaId: f, naziv: "ProBook", proizvodjacId: p.id, kategorijaId: kat.id } });
  const [s1, s2] = await Promise.all(["Zagreb", "Split"].map((naziv) => prisma.skladiste.create({ data: { firmaId: f, naziv } })));
  return { firma, f, a: a!, b: b!, m, s1: s1!, s2: s2! };
}

describe("izvještaji 6.2", () => {
  it("potraživanja: otvoreno = dospjelo + nije dospjelo; odobrenje umanjuje (kao na popisu računa); plaćeni, nacrti i ponude ne ulaze", async () => {
    const { f, a, b } = await pripremi();
    const dok = (partnerId: string, ukupno: string, placeno: string, dospijece: string, vrsta = "RACUN", status = "IZDAN") =>
      prisma.prodajniDokument.create({
        data: { firmaId: f, vrsta, status, partnerId, datum: d("2026-09-01"), dospijece: d(dospijece), ukupno, placeno },
      });
    await dok(a.id, "125.00", "25.00", "2026-09-10"); // dospjelo 100
    await dok(a.id, "50.00", "0", "2026-10-10"); // nije dospjelo 50
    await dok(b.id, "80.00", "80.00", "2026-09-10"); // plaćeno
    await dok(b.id, "70.00", "0", "2026-09-10", "RACUN", "NACRT");
    await dok(b.id, "60.00", "0", "2026-09-10", "PONUDA");
    await dok(a.id, "-20.00", "0", "2026-09-05", "ODOBRENJE"); // neisplaćeno odobrenje
    const r = await run("potrazivanja", f);
    expect(r.redovi).toEqual([
      expect.objectContaining({ kupac: "Alfa", racuna: 3, otvoreno: 13000, dospjelo: 8000, nijeDospjelo: 5000, najstarije: "2026-09-05" }),
    ]);
    expect(r.zbroj).toEqual({ racuna: 3, otvoreno: 13000, dospjelo: 8000, nijeDospjelo: 5000 });
    // isto kao „otvoreno“ na popisu računa (važeći računi i odobrenja, bez storna)
    const o = await prisma.prodajniDokument.aggregate({
      where: { firmaId: f, status: "IZDAN", vrsta: { in: ["RACUN", "PREDUJAM", "ODOBRENJE"] } },
      _sum: { ukupno: true, placeno: true },
    });
    expect(Math.round((Number(o._sum.ukupno) - Number(o._sum.placeno)) * 100)).toBe(r.zbroj["otvoreno"]);
  });

  it("zaliha po modelu i skladištu; filtar skladišta; nabavna vrijednost je osjetljiv stupac", async () => {
    const { f, m, s1, s2 } = await pripremi();
    const ur = (serijski: string, stanje: "NA_SKLADISTU" | "REZERVIRAN" | "PRODAN", skladisteId: string | null, cijena: string) =>
      prisma.uredaj.create({ data: { firmaId: f, serijski, modelId: m.id, stanje, skladisteId, nabavnaCijena: cijena } });
    await ur("A", "NA_SKLADISTU", s1.id, "100.00");
    await ur("B", "REZERVIRAN", s1.id, "200.00");
    await ur("C", "NA_SKLADISTU", s2.id, "50.00");
    await ur("D", "PRODAN", null, "999.00");
    const r = await run("zaliha-modeli", f);
    expect(r.zbroj).toEqual({ naSkladistu: 2, rezervirano: 1, vrijednost: 35000 });
    expect((await run("zaliha-modeli", f, { skladiste: s2.id })).zbroj).toEqual({ naSkladistu: 1, rezervirano: 0, vrijednost: 5000 });
    expect(izvjestaj("zaliha-modeli")!.stupci.find((s) => s.kljuc === "vrijednost")!.osjetljivo).toBe(true);
    // bez prava „costs“ se ni ne sortira po nabavnoj vrijednosti (redoslijed bi je otkrio)
    const bezCosts = { ...punaPrava(), posebna: { ...punaPrava().posebna, costs: false } };
    const p1 = await pokreni(izvjestaj("zaliha-modeli")!, prisma, f, bezCosts, { sort: "vrijednost", smjer: "desc" }, { skip: 0, take: 10 }, DANAS);
    expect(p1.sort.kljuc).toBe("naSkladistu");
    const p2 = await pokreni(
      izvjestaj("zaliha-modeli")!,
      prisma,
      f,
      punaPrava(),
      { sort: "vrijednost", smjer: "desc" },
      { skip: 0, take: 10 },
      DANAS,
    );
    expect(p2.sort.kljuc).toBe("vrijednost");
  });

  it("najam po ugovoru = zbroj rata u razdoblju", async () => {
    const { f, a, m } = await pripremi();
    const g = await prisma.ugovorNajma.create({
      data: { firmaId: f, broj: "NU-1/2026", godina: 2026, redni: 1, partnerId: a.id, od: d("2026-01-01") },
    });
    const u = await prisma.uredaj.create({ data: { firmaId: f, serijski: "N-1", modelId: m.id, stanje: "U_NAJMU", partnerId: a.id } });
    const plan = await prisma.uredajNaUgovoru.create({ data: { firmaId: f, ugovorId: g.id, uredajId: u.id, od: d("2026-01-01") } });
    for (const [mj, iznos] of [
      ["2026-01-01", "100.00"],
      ["2026-02-01", "100.00"],
      ["2025-12-01", "40.00"],
    ] as const)
      await prisma.rataNajma.create({ data: { firmaId: f, planId: plan.id, mjesec: d(mj), iznos } });
    expect((await run("najam-ugovori", f)).zbroj).toEqual({ uredaja: 1, rata: 2, iznos: 20000 });
    expect((await run("najam-ugovori", f, { godina: "sve" })).zbroj).toEqual({ uredaja: 1, rata: 3, iznos: 24000 });
  });

  it("troškovi po kategoriji = pregled troškova (isto pravilo); roba samo uz „costs“", async () => {
    const { f } = await pripremi();
    const kat = await prisma.kategorijaTroska.create({ data: { firmaId: f, naziv: "Najam prostora" } });
    await prisma.trosak.create({
      data: { firmaId: f, datum: d("2026-03-01"), kategorijaId: kat.id, opis: "Ured", iznos: "500.00", pdv: "125.00", placeno: true },
    });
    await prisma.trosak.create({
      data: { firmaId: f, datum: d("2026-04-01"), kategorijaId: kat.id, opis: "Ured", iznos: "500.00", pdv: "125.00", placeno: false },
    });
    await prisma.primka.create({
      data: {
        firmaId: f,
        broj: "PRI-1/2026",
        godina: 2026,
        redni: 1,
        datum: d("2026-03-02"),
        skladisteId: (await prisma.skladiste.findFirstOrThrow({ where: { firmaId: f } })).id,
        status: "IZDANA",
        knjiziUTroskove: true,
        nabavnaVrijednost: "300.00",
        brojUredaja: 0,
      },
    });
    const r = await run("troskovi-kategorije", f);
    const izvor = await pregledTroskova(prisma, f, punaPrava(), "2026-01-01", "2026-12-31");
    expect(r.zbroj["iznos"]).toBe(izvor.reduce((s, x) => s + x.iznos, 0));
    expect(r.zbroj).toEqual({ stavki: 3, iznos: 130000, neplaceno: 80000 });
    const bez = await run("troskovi-kategorije", f, {}, praznaPrava());
    expect(bez.zbroj).toEqual({ stavki: 2, iznos: 100000, neplaceno: 50000 });
  });

  it("marža: prihod = prihod po mjesecima; servis po mjesecima broji statuse", async () => {
    const { f, a } = await pripremi();
    await prisma.prodajniDokument.create({
      data: { firmaId: f, vrsta: "RACUN", status: "IZDAN", partnerId: a.id, datum: d("2026-05-05"), osnovica: "400.00" },
    });
    await prisma.prodajniDokument.create({
      data: { firmaId: f, vrsta: "STORNO", status: "IZDAN", partnerId: a.id, datum: d("2026-05-06"), osnovica: "-100.00" },
    });
    expect((await run("marze-mjeseci", f)).zbroj["prihod"]).toBe((await run("prihod-mjeseci", f)).zbroj["osnovica"]);
    const u = await prisma.uredaj.create({
      data: {
        firmaId: f,
        serijski: "S-1",
        modelId: (await prisma.modelUredaja.findFirstOrThrow({ where: { firmaId: f } })).id,
        stanje: "NA_SKLADISTU",
      },
    });
    const nalog = (redni: number, status: string, datum: string, zatvoren: string | null) =>
      prisma.servisniNalog.create({
        data: {
          firmaId: f,
          broj: `SRV-${redni}/2026`,
          godina: 2026,
          redni,
          datum: d(datum),
          uredajId: u.id,
          stanjePrije: "NA_SKLADISTU",
          status,
          opisKvara: "x",
          zatvoren: zatvoren ? d(zatvoren) : null,
        },
      });
    await nalog(1, "VRACEN", "2026-06-01", "2026-06-05");
    await nalog(2, "OTPISAN", "2026-06-10", "2026-06-12");
    await nalog(3, "POPRAVAK", "2026-07-01", null);
    const s = await run("servis-mjeseci", f);
    expect(s.zbroj).toEqual({ zaprimljeno: 3, vraceno: 1, otpisano: 1, otkazano: 0, otvoreno: 1, trajanje: 3 });
    expect(s.redovi.map((r) => [r["mjesec"], r["zaprimljeno"], r["trajanje"]])).toEqual([
      ["2026-07", 1, null],
      ["2026-06", 2, 3],
    ]);
  });
});
