import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, ocistiBazu, testnaPrisma } from "@/test/baza";
import { IZVJESTAJI, izvjestaj } from ".";
import { pokreni } from "./izvrsi";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const DANAS = "2026-09-26";

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const f = firma.id;
  const [a, b] = await Promise.all(["Alfa d.o.o.", "Beta d.o.o."].map((naziv) => prisma.partner.create({ data: { firmaId: f, naziv } })));
  const p = await prisma.proizvodjac.create({ data: { firmaId: f, naziv: "HP" } });
  const kat = await prisma.kategorija.create({ data: { firmaId: f, naziv: "Laptopi" } });
  const [m1, m2] = await Promise.all(
    ["ProBook", "EliteBook"].map((naziv) => prisma.modelUredaja.create({ data: { firmaId: f, naziv, proizvodjacId: p.id, kategorijaId: kat.id } })),
  );
  const u1 = await prisma.uredaj.create({ data: { firmaId: f, serijski: "U-1", modelId: m1!.id, stanje: "PRODAN" } });
  let broj = 0;
  /** dokument s osnovicom (centi) i stavkama; osnovica ≠ zbroj stavki = popust dokumenta/zaokruživanje */
  const dok = async (
    vrsta: string,
    datum: string,
    partnerId: string | null,
    osnovica: number,
    stavke: { modelId?: string; uredajId?: string; kolicina: number; iznos: number }[],
    status = "IZDAN",
  ) => {
    const d = await prisma.prodajniDokument.create({
      data: {
        firmaId: f,
        vrsta,
        status,
        broj: status === "NACRT" ? null : `${++broj}/PP1/1`,
        datum: new Date(`${datum}T00:00:00Z`),
        partnerId,
        osnovica: (osnovica / 100).toFixed(2),
        pdv: ((osnovica * 0.25) / 100).toFixed(2),
        ukupno: ((osnovica * 1.25) / 100).toFixed(2),
      },
    });
    let r = 0;
    for (const s of stavke)
      await prisma.stavkaProdajnogDokumenta.create({
        data: {
          firmaId: f,
          dokumentId: d.id,
          redoslijed: ++r,
          vrsta: s.uredajId ? "UREDAJ" : s.modelId ? "MODEL" : "USLUGA",
          naziv: "x",
          kolicina: s.kolicina,
          cijena: "0",
          vrstaIsporuke: "ROBA",
          stopa: 2500,
          kategorija: "S",
          iznos: (s.iznos / 100).toFixed(2),
          modelId: s.modelId ?? null,
          uredajId: s.uredajId ?? null,
        },
      });
  };
  await dok("RACUN", "2026-01-15", a!.id, 100000, [{ uredajId: u1.id, kolicina: 1000, iznos: 100000 }]);
  // popust na dokument 10 %: stavke 150,00 + 50,00 = 200,00, osnovica 180,00
  await dok("RACUN", "2026-02-10", b!.id, 18000, [
    { modelId: m2!.id, kolicina: 2000, iznos: 15000 },
    { kolicina: 1000, iznos: 5000 },
  ]);
  await dok("ODOBRENJE", "2026-02-20", b!.id, -5000, [{ modelId: m2!.id, kolicina: -1000, iznos: -5000 }]);
  await dok("RACUN", "2026-03-01", null, 3333, [{ kolicina: 1000, iznos: 3333 }]);
  await dok("RACUN", "2025-12-31", a!.id, 70000, [{ modelId: m1!.id, kolicina: 1000, iznos: 70000 }]);
  await dok("RACUN", "2026-03-05", a!.id, 99999, [{ modelId: m1!.id, kolicina: 1000, iznos: 99999 }], "NACRT");
  await dok("PONUDA", "2026-03-05", a!.id, 55555, [{ modelId: m1!.id, kolicina: 1000, iznos: 55555 }]);
  // druga firma ne ulazi
  const druga = await napraviFirmu(prisma);
  await prisma.prodajniDokument.create({
    data: { firmaId: druga.id, vrsta: "RACUN", status: "IZDAN", datum: new Date("2026-01-01"), osnovica: "777.77" },
  });
  return { firma, a: a!, b: b! };
}

const sve = async (kljuc: string, firmaId: string, sp: Record<string, string>) => {
  const iz = izvjestaj(kljuc)!;
  const r = await pokreni(iz, prisma, firmaId, sp, { skip: 0, take: 1000 }, DANAS);
  return r.rezultat;
};

describe("izvještaji prodaje", () => {
  it("prihod po kupcu i po modelu = prihod po mjesecima, do centa (i zbroj iz baze = zbroj redaka)", async () => {
    const { firma } = await pripremi();
    for (const sp of <Record<string, string>[]>[
      {},
      { godina: "sve" },
      { godina: "2025" },
      { od: "2026-02-01", do: "2026-02-28" },
      { trazi: "beta" },
    ]) {
      const mj = await sve("prihod-mjeseci", firma.id, sp);
      const ku = await sve("prihod-kupci", firma.id, sp);
      const mo = await sve("prihod-modeli", firma.id, sp);
      const zbrojRedaka = (r: { redovi: Record<string, unknown>[] }, k: string) => r.redovi.reduce((s, x) => s + Number(x[k]), 0);
      expect(zbrojRedaka(mj, "osnovica")).toBe(mj.zbroj["osnovica"]);
      expect(zbrojRedaka(ku, "osnovica")).toBe(mj.zbroj["osnovica"]);
      expect(zbrojRedaka(mo, "iznos")).toBe(mj.zbroj["osnovica"]);
      expect(ku.zbroj["osnovica"]).toBe(mj.zbroj["osnovica"]);
      expect(mo.zbroj["iznos"]).toBe(mj.zbroj["osnovica"]);
    }
    // ručno: 2026 = 1.000,00 + 180,00 − 50,00 + 33,33 = 1.163,33
    const g = await sve("prihod-mjeseci", firma.id, {});
    expect(g.zbroj).toMatchObject({ dokumenata: 4, osnovica: 116333 });
    expect(g.redovi.map((r) => [r["mjesec"], r["osnovica"]])).toEqual([
      ["2026-03", 3333],
      ["2026-02", 13000],
      ["2026-01", 100000],
    ]);
    const mo = await sve("prihod-modeli", firma.id, {});
    expect(Object.fromEntries(mo.redovi.map((r) => [r["model"], r["iznos"]]))).toEqual({
      ProBook: 100000,
      EliteBook: 10000,
      "Usluge i ostalo (bez modela)": 8333,
      "Popust na dokument i zaokruživanje": -2000,
    });
    const ku = await sve("prihod-kupci", firma.id, { godina: "sve" });
    expect(Object.fromEntries(ku.redovi.map((r) => [r["kupac"], r["osnovica"]]))).toEqual({
      "Alfa d.o.o.": 170000,
      "Beta d.o.o.": 13000,
      "Bez kupca": 3333,
    });
  });

  it("svaki izvještaj radi sa svakim sortiranjem u oba smjera i sa stranicama", async () => {
    const { firma } = await pripremi();
    for (const iz of IZVJESTAJI) {
      for (const s of iz.stupci.filter((x) => x.sort))
        for (const smjer of ["asc", "desc"]) {
          const r = await pokreni(iz, prisma, firma.id, { godina: "sve", sort: s.kljuc, smjer }, { skip: 0, take: 2 }, DANAS);
          expect(r.sort).toEqual({ kljuc: s.kljuc, smjer });
          expect(r.rezultat.redovi.length).toBeLessThanOrEqual(2);
        }
      const str2 = await pokreni(iz, prisma, firma.id, { godina: "sve" }, { skip: 2, take: 2 }, DANAS);
      expect(str2.rezultat.ukupno).toBeGreaterThanOrEqual(str2.rezultat.redovi.length);
    }
  });
});
