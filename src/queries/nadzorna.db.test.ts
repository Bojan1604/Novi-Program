import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { punaPrava, ZADANE_ULOGE } from "@/domain/prava";
import { izvjestaj } from "@/lib/izvjestaji";
import { pokreni } from "@/lib/izvjestaji/izvrsi";
import { napraviFirmu, ocistiBazu, testnaPrisma } from "@/test/baza";
import { podaciNadzorne } from "./nadzorna";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const DANAS = "2026-09-26";
const pravaUloge = (naziv: string) => ZADANE_ULOGE.find((u) => u.naziv === naziv)!.prava;
const d = (x: string) => new Date(`${x}T00:00:00Z`);

describe("nadzorna ploča", () => {
  it("brojevi = izvještaji; kartice samo uz prava; upozorenja", async () => {
    const firma = await napraviFirmu(prisma);
    const f = firma.id;
    const a = await prisma.partner.create({ data: { firmaId: f, naziv: "Alfa" } });
    await prisma.prodajniDokument.createMany({
      data: [
        {
          firmaId: f,
          vrsta: "RACUN",
          status: "IZDAN",
          partnerId: a.id,
          datum: d("2026-09-02"),
          dospijece: d("2026-09-10"),
          osnovica: "100.00",
          ukupno: "125.00",
        },
        {
          firmaId: f,
          vrsta: "RACUN",
          status: "IZDAN",
          partnerId: a.id,
          datum: d("2026-08-02"),
          dospijece: d("2026-10-10"),
          osnovica: "40.00",
          ukupno: "50.00",
        },
        { firmaId: f, vrsta: "ODOBRENJE", status: "IZDAN", partnerId: a.id, datum: d("2026-09-05"), osnovica: "-10.00", ukupno: "-12.50" },
      ],
    });
    const p = await prisma.proizvodjac.create({ data: { firmaId: f, naziv: "HP" } });
    const kat = await prisma.kategorija.create({ data: { firmaId: f, naziv: "L" } });
    const m = await prisma.modelUredaja.create({ data: { firmaId: f, naziv: "X", proizvodjacId: p.id, kategorijaId: kat.id } });
    const skl = await prisma.skladiste.create({ data: { firmaId: f, naziv: "Z" } });
    await prisma.uredaj.createMany({
      data: [
        { firmaId: f, serijski: "S1", modelId: m.id, stanje: "NA_SKLADISTU", skladisteId: skl.id },
        { firmaId: f, serijski: "S2", modelId: m.id, stanje: "NA_SKLADISTU", skladisteId: skl.id },
        { firmaId: f, serijski: "N1", modelId: m.id, stanje: "U_NAJMU", partnerId: a.id },
      ],
    });
    const prava = punaPrava();
    const n = await podaciNadzorne(prisma, f, prava, DANAS);
    const kartica = (k: string) => n.kartice.find((x) => x.kljuc === k)?.vrijednost;
    const iz = async (kljuc: string, sp: Record<string, string>) =>
      (await pokreni(izvjestaj(kljuc)!, prisma, f, prava, sp, { skip: 0, take: 100 }, DANAS)).rezultat.zbroj;
    expect(kartica("prihod")).toBe((await iz("prihod-mjeseci", { godina: "sve", od: "2026-09-01", do: DANAS }))["osnovica"]);
    expect(kartica("prihod")).toBe(9000);
    expect(kartica("potrazivanja")).toBe((await iz("potrazivanja", {}))["otvoreno"]);
    expect(kartica("skladiste")).toBe((await iz("zaliha-modeli", {}))["naSkladistu"]);
    expect(kartica("najam")).toBe(1);
    expect(n.prihodPoMjesecima).toEqual([
      { mjesec: "2026-08", osnovica: 4000 },
      { mjesec: "2026-09", osnovica: 9000 },
    ]);
    expect(n.upozorenja.map((u) => u.kljuc)).toContain("dospjelo");

    // skladištar: bez prihoda i potraživanja
    const s = await podaciNadzorne(prisma, f, pravaUloge("Skladištar"), DANAS);
    expect(s.kartice.map((c) => c.kljuc).sort()).toEqual(["najam", "servis", "skladiste", "eracuni"].sort());
  });
});
