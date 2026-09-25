import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { postojeciSerijski, stornirajPrimku, zaprimi, type UlazPrimke } from "./primke";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { promijeniStanje } from "./uredaji";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi(uloga = "Administrator") {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga, ime: "Skladištar Stjepan" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skladiste = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Lenovo" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "T14", proizvodjacId: p.id, kategorijaId: kat.id, jamstvoMjeseci: 36 },
  });
  const dobavljac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Distributer d.o.o.", dobavljac: true, kupac: false } });
  const ulaz = (serijski: string[], izmjene: Partial<UlazPrimke> = {}): UlazPrimke => ({
    datum: "2026-09-25",
    skladisteId: skladiste.id,
    dobavljacId: dobavljac.id,
    stanjeRobeId: null,
    dokumentDobavljaca: "OTP-77",
    napomena: null,
    knjiziUTroskove: false,
    stavke: serijski.map((s) => ({ serijski: s, modelId: model.id, nabavnaCijena: 650_00, cpu: "i5-1345U" })),
    ...izmjene,
  });
  return { firma, A, skladiste, model, dobavljac, ulaz };
}

describe("zaprimanje", () => {
  it("primka s brojem, uređaji na skladištu s jamstvom iz modela, događaji i dnevnik", async () => {
    const { A, ulaz, firma, skladiste } = await pripremi();
    const r = await zaprimi(prisma, A, ulaz(["sn100", "SN200", "sn300"]), SADA);
    expect(r.broj).toBe("PRI-1/2026");
    const uredaji = await prisma.uredaj.findMany({ where: { firmaId: firma.id }, orderBy: { serijski: "asc" } });
    expect(uredaji.map((u) => u.serijski)).toEqual(["SN100", "SN200", "SN300"]);
    expect(uredaji[0]).toMatchObject({ stanje: "NA_SKLADISTU", skladisteId: skladiste.id, primkaId: r.id, cpu: "i5-1345U" });
    expect(uredaji[0]!.jamstvoDo?.toISOString().slice(0, 10)).toBe("2029-09-25");
    expect(uredaji[0]!.nabavnaCijena?.toString()).toBe("650");
    const p = await prisma.primka.findUniqueOrThrow({ where: { id: r.id } });
    expect(p).toMatchObject({ brojUredaja: 3, korisnik: "Skladištar Stjepan", dokumentDobavljaca: "OTP-77" });
    expect(p.nabavnaVrijednost?.toString()).toBe("1950");
    expect(await prisma.dogadajUredaja.count({ where: { firmaId: firma.id, radnja: "zaprimanje", dokumentBroj: "PRI-1/2026" } })).toBe(3);
    expect(await prisma.dnevnik.count({ where: { entitet: "Primka", entitetId: r.id } })).toBe(1);
  });

  it("brojevi po godini, bez rupa kad zaprimanje ne uspije, bez duplih kod istovremenih primki", async () => {
    const { A, ulaz } = await pripremi();
    await zaprimi(prisma, A, ulaz(["A100"]), SADA);
    await expect(zaprimi(prisma, A, ulaz(["A100"]), SADA)).rejects.toThrow("Već postoje u programu: A100 (PRI-1/2026)");
    const r = await Promise.all([
      zaprimi(prisma, A, ulaz(["B100"]), SADA),
      zaprimi(prisma, A, ulaz(["B200"]), SADA),
      zaprimi(prisma, A, ulaz(["B300"]), SADA),
    ]);
    expect(r.map((x) => x.broj).sort()).toEqual(["PRI-2/2026", "PRI-3/2026", "PRI-4/2026"]);
    const lani = await zaprimi(prisma, A, ulaz(["C100"], { datum: "2025-12-31" }), SADA);
    expect(lani.broj).toBe("PRI-1/2025");
  });

  it("dvije kartice s istim serijskim broju istovremeno = jedna primka", async () => {
    const { A, ulaz, firma } = await pripremi();
    const r = await Promise.allSettled([zaprimi(prisma, A, ulaz(["DUPLI1", "X100"]), SADA), zaprimi(prisma, A, ulaz(["DUPLI1", "X200"]), SADA)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.primka.count({ where: { firmaId: firma.id } })).toBe(1);
    expect(await prisma.uredaj.count({ where: { firmaId: firma.id, serijski: "DUPLI1" } })).toBe(1);
    // broj odbijene primke nije potrošen
    expect((await zaprimi(prisma, A, ulaz(["NOVI"]), SADA)).broj).toBe("PRI-2/2026");
  });

  it("dvostruki serijski u istom popisu, datum u budućnosti, neaktivan model, kupac umjesto dobavljača", async () => {
    const { A, ulaz, model, firma } = await pripremi();
    await expect(zaprimi(prisma, A, ulaz(["X100", "x100"]), SADA)).rejects.toThrow("upisan dvaput");
    await expect(zaprimi(prisma, A, ulaz(["X100"], { datum: "2026-09-26" }), SADA)).rejects.toThrow("budućnosti");
    await prisma.modelUredaja.update({ where: { id: model.id }, data: { aktivan: false } });
    await expect(zaprimi(prisma, A, ulaz(["X100"]), SADA)).rejects.toThrow("deaktivirani");
    await prisma.modelUredaja.update({ where: { id: model.id }, data: { aktivan: true } });
    const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Samo kupac", kupac: true } });
    await expect(zaprimi(prisma, A, ulaz(["X100"], { dobavljacId: kupac.id }), SADA)).rejects.toThrow("dobavljač");
  });

  it("skladištar bez prava na nabavne cijene: nabavna cijena se ne sprema", async () => {
    const { A, ulaz, firma } = await pripremi("Skladištar");
    expect(A.prava.posebna.costs).toBe(false);
    const r = await zaprimi(prisma, A, ulaz(["NC100"]), SADA);
    expect((await prisma.uredaj.findFirstOrThrow({ where: { firmaId: firma.id } })).nabavnaCijena).toBeNull();
    expect((await prisma.primka.findUniqueOrThrow({ where: { id: r.id } })).nabavnaVrijednost).toBeNull();
  });

  it("pregled postojećih serijskih", async () => {
    const { A, ulaz, firma } = await pripremi();
    await zaprimi(prisma, A, ulaz(["P100"]), SADA);
    expect(await postojeciSerijski(prisma, firma.id, ["P100", "P200"])).toEqual([{ serijski: "P100", stanje: "NA_SKLADISTU", primka: "PRI-1/2026" }]);
  });
});

describe("storno primke", () => {
  it("dok se uređaji nisu micali: uređaji se brišu, primka je stornirana, broj se ne ponavlja", async () => {
    const { A, ulaz, firma } = await pripremi();
    const r = await zaprimi(prisma, A, ulaz(["S100", "S200"]), SADA);
    await stornirajPrimku(prisma, A, r.id);
    expect(await prisma.uredaj.count({ where: { firmaId: firma.id } })).toBe(0);
    expect((await prisma.primka.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("STORNIRANA");
    expect((await zaprimi(prisma, A, ulaz(["S100"]), SADA)).broj).toBe("PRI-2/2026");
    await expect(stornirajPrimku(prisma, A, r.id)).rejects.toThrow("već stornirana");
  });

  it("nije moguć ako je ijedan uređaj prodan ili premješten", async () => {
    const { A, ulaz, firma } = await pripremi();
    const r = await zaprimi(prisma, A, ulaz(["M100", "M200"]), SADA);
    const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "K" } });
    const m1 = await prisma.uredaj.findFirstOrThrow({ where: { serijski: "M100" } });
    await prisma.$transaction((tx) =>
      promijeniStanje(tx, { firmaId: firma.id, korisnikId: A.korisnikId }, [m1.id], "prodaja", { partnerId: kupac.id }),
    );
    await expect(stornirajPrimku(prisma, A, r.id)).rejects.toThrow("već korišteni (M100)");
    expect(await prisma.uredaj.count({ where: { firmaId: firma.id } })).toBe(2);
  });
});
