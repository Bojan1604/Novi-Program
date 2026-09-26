import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sFirmom } from "@/lib/firma-db";
import { pravaClana } from "@/services/korisnici";
import { napraviZadaneSifrarnike } from "@/services/sifrarnici";
import { izdajDokument } from "@/services/skladisni-dokumenti";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { popisDokumenata, popisOdobrenja, skladisniDokument, type FilterDokumenata } from "./skladisni-dokumenti";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

describe("popis skladišnih dokumenata (upit)", () => {
  it("sva sortiranja i filtri rade nad bazom; detalj s uređajima i odobrenjem", async () => {
    const firma = await napraviFirmu(prisma);
    await napraviZadaneSifrarnike(prisma, firma.id);
    const k = await napraviKorisnika(prisma, firma.id);
    const A = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
    const zg = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
    const st = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "Split" } });
    const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
    const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
    const m = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "X", proizvodjacId: p.id, kategorijaId: kat.id } });
    for (const s of ["D1", "D2", "D3"].map((x) => `SN-${x}`))
      await prisma.uredaj.create({ data: { firmaId: firma.id, serijski: s, modelId: m.id, stanje: "NA_SKLADISTU", skladisteId: zg.id } });
    const osnova = { datum: "2026-09-25", partnerId: null, napomena: null };
    const sada = new Date("2026-09-25T12:00:00Z");
    await izdajDokument(
      prisma,
      A,
      { ...osnova, vrsta: "MEDJUSKLADISNICA", skladisteIzId: zg.id, skladisteUId: st.id, razlog: null, serijski: ["SN-D1"] },
      sada,
    );
    const izl = await izdajDokument(
      prisma,
      A,
      { ...osnova, vrsta: "IZLAZ", skladisteIzId: zg.id, skladisteUId: null, razlog: "Oštećen", serijski: ["SN-D2", "SN-D3"] },
      sada,
    );
    const db = sFirmom(prisma, firma.id);
    const f = (x: Partial<FilterDokumenata> = {}): FilterDokumenata => ({
      vrsta: [],
      status: [],
      sort: { kljuc: "datum", smjer: "desc" },
      stranica: 1,
      velicina: 25,
      ...x,
    });
    for (const kljuc of ["datum", "broj"] as const)
      for (const smjer of ["asc", "desc"] as const) expect((await popisDokumenata(db, firma.id, f({ sort: { kljuc, smjer } }))).ukupno).toBe(2);
    const brojevi = async (x: Partial<FilterDokumenata>) => (await popisDokumenata(db, firma.id, f(x))).redovi.map((r) => r.broj);
    expect(await brojevi({ vrsta: ["IZLAZ"] })).toEqual(["IZL-1/2026"]);
    expect(await brojevi({ status: ["CEKA_ODOBRENJE"] })).toEqual(["IZL-1/2026"]);
    expect(await brojevi({ trazi: "sn-d1" })).toEqual(["MSK-1/2026"]);
    expect(await brojevi({ trazi: "oštećen" })).toEqual(["IZL-1/2026"]);
    expect(await brojevi({ vrsta: ["NEPOZNATO"], status: ["X"] })).toHaveLength(2);
    // zbroj samo provedenih
    expect((await popisDokumenata(db, firma.id, f())).zbrojUredaja).toBe(1);
    const d = await skladisniDokument(db, firma.id, izl.id);
    expect(d!.stavke.map((s) => s.uredaj.serijski)).toEqual(["SN-D2", "SN-D3"]);
    expect(d!.odobrenje).toMatchObject({ status: "CEKA" });
    expect(await skladisniDokument(db, firma.id, "x")).toBeNull();
    expect((await popisOdobrenja(db, firma.id, { status: ["CEKA"], stranica: 1, velicina: 25 })).ceka).toBe(1);
  });
});
