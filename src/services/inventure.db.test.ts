import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sFirmom } from "@/lib/firma-db";
import { inventura, popisInventura } from "@/queries/inventure";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { otvoriInventuru, skenirajUInventuru, ukloniIzInventure, zakljuciInventuru } from "./inventure";
import { pravaClana, type Akter } from "./korisnici";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Skladištar" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const zg = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const st = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "Split" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const m = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "X", proizvodjacId: p.id, kategorijaId: kat.id } });
  const u = (serijski: string, x: object = {}) =>
    prisma.uredaj.create({ data: { firmaId: firma.id, serijski, modelId: m.id, stanje: "NA_SKLADISTU", skladisteId: zg.id, ...x } });
  return { firma, A, zg, st, u };
}

describe("inventura", () => {
  it("skeniranje s opisom, ponavljanje se broji, zaključenje: pronađeni, manjak, višak", async () => {
    const { A, zg, st, u, firma } = await pripremi();
    await u("INV1");
    await u("INV2", { stanje: "REZERVIRAN" });
    await u("INV3");
    await u("DRUGDJE1", { skladisteId: st.id });
    const inv = await otvoriInventuru(prisma, A, { skladisteId: zg.id, datum: "2026-09-25", napomena: null }, SADA);
    expect(inv.broj).toBe("INV-1/2026");
    await expect(otvoriInventuru(prisma, A, { skladisteId: zg.id, datum: "2026-09-25", napomena: null }, SADA)).rejects.toThrow(
      "već je otvorena inventura INV-1/2026",
    );

    const r = await skenirajUInventuru(prisma, A, inv.id, ["inv1", "DRUGDJE1", "NEPOZNAT1", "INV2"]);
    expect(r.map((x) => [x.serijski, x.rezultat, x.puta])).toEqual([
      ["INV1", "PRONADJEN", 1],
      ["DRUGDJE1", "VISAK", 1],
      ["NEPOZNAT1", "NEPOZNAT", 1],
      ["INV2", "PRONADJEN", 1],
    ]);
    expect(r[1]!.opis).toBe("U programu: Na skladištu · Split");
    expect((await skenirajUInventuru(prisma, A, inv.id, ["INV1"]))[0]!.puta).toBe(2);
    await ukloniIzInventure(prisma, A, inv.id, "INV2");

    const z = await zakljuciInventuru(prisma, A, inv.id);
    expect(z).toEqual({ ocekivano: 3, pronadjeno: 1, manjak: 2, visak: 2 });
    const stavke = await prisma.stavkaInventure.findMany({ where: { inventuraId: inv.id }, orderBy: { serijski: "asc" } });
    expect(stavke.map((s) => [s.serijski, s.rezultat])).toEqual([
      ["DRUGDJE1", "VISAK"],
      ["INV1", "PRONADJEN"],
      ["INV2", "MANJAK"],
      ["INV3", "MANJAK"],
      ["NEPOZNAT1", "NEPOZNAT"],
    ]);
    // zaključena se ne mijenja; uređaji netaknuti
    await expect(skenirajUInventuru(prisma, A, inv.id, ["INV3"])).rejects.toThrow("zaključena");
    await expect(zakljuciInventuru(prisma, A, inv.id)).rejects.toThrow("zaključena");
    expect(await prisma.uredaj.count({ where: { firmaId: firma.id, skladisteId: zg.id } })).toBe(3);
    const db = sFirmom(prisma, firma.id);
    const q = await inventura(db, firma.id, inv.id, { rezultat: ["MANJAK", "NEPOSTOJI"], stranica: 1, velicina: 25 });
    expect(q!.stavke.map((x) => x.serijski).sort()).toEqual(["INV2", "INV3"]);
    expect(q!.zivo).toBeNull();
    expect((await popisInventura(db, firma.id, { status: ["ZAKLJUCENA"], stranica: 1, velicina: 25 })).ukupno).toBe(1);
    // nova inventura istog skladišta sad može
    expect((await otvoriInventuru(prisma, A, { skladisteId: zg.id, datum: "2026-09-25", napomena: null }, SADA)).broj).toBe("INV-2/2026");
  });

  it("neispravan serijski i tuđa inventura", async () => {
    const { A, zg } = await pripremi();
    const inv = await otvoriInventuru(prisma, A, { skladisteId: zg.id, datum: "2026-09-25", napomena: null }, SADA);
    await expect(skenirajUInventuru(prisma, A, inv.id, ["a"])).rejects.toThrow("prekratak");
    const druga = await napraviFirmu(prisma, "Druga");
    await expect(skenirajUInventuru(prisma, { ...A, firmaId: druga.id }, inv.id, ["ABC123"])).rejects.toThrow("Inventura ne postoji.");
  });
});
