import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { izdajDokument, odluciOZahtjevu, type UlazDokumenta } from "./skladisni-dokumenti";
import { promijeniStanje } from "./uredaji";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const akter = async (uloga: string, ime: string): Promise<Akter> => {
    const k = await napraviKorisnika(prisma, firma.id, { uloga, ime });
    return { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  };
  const skladistar = await akter("Skladištar", "Stjepan");
  const voditelj = await akter("Voditelj", "Vesna");
  const voditelj2 = await akter("Voditelj", "Vlado");
  const zagreb = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const split = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "Split" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "ProBook", proizvodjacId: p.id, kategorijaId: kat.id } });
  const uredaj = (serijski: string, x: object = {}) =>
    prisma.uredaj.create({ data: { firmaId: firma.id, serijski, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: zagreb.id, ...x } });
  const ulaz = (x: Partial<UlazDokumenta>): UlazDokumenta => ({
    vrsta: "MEDJUSKLADISNICA",
    datum: "2026-09-25",
    skladisteIzId: zagreb.id,
    skladisteUId: split.id,
    partnerId: null,
    razlog: null,
    napomena: null,
    serijski: [],
    ...x,
  });
  return { firma, skladistar, voditelj, voditelj2, zagreb, split, uredaj, ulaz };
}

describe("međuskladišnica", () => {
  it("premješta uređaje, broj po godini, povijest s dokumentom", async () => {
    const { skladistar, uredaj, ulaz, split, firma } = await pripremi();
    const a = await uredaj("MSK001");
    await uredaj("MSK002", { stanje: "REZERVIRAN" });
    const r = await izdajDokument(prisma, skladistar, ulaz({ serijski: ["msk001", "MSK002"] }), SADA);
    expect(r).toMatchObject({ broj: "MSK-1/2026", status: "IZDAN" });
    const u = await prisma.uredaj.findMany({ where: { firmaId: firma.id }, orderBy: { serijski: "asc" } });
    expect(u.map((x) => [x.stanje, x.skladisteId])).toEqual([
      ["NA_SKLADISTU", split.id],
      ["REZERVIRAN", split.id],
    ]);
    const dog = await prisma.dogadajUredaja.findFirstOrThrow({ where: { uredajId: a.id } });
    expect(dog).toMatchObject({ radnja: "medjuskladisnica", dokumentVrsta: "Međuskladišnica", dokumentBroj: "MSK-1/2026", dokumentId: r.id });
    expect(
      (
        await izdajDokument(
          prisma,
          skladistar,
          ulaz({
            skladisteIzId: split.id,
            skladisteUId: (await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id, NOT: { id: split.id } } })).id,
            serijski: ["MSK001"],
          }),
          SADA,
        )
      ).broj,
    ).toBe("MSK-2/2026");
  });

  it("odbija: uređaj u drugom skladištu, nepostojeći, dvaput upisan, isto skladište, budući datum — i ne troši broj", async () => {
    const { skladistar, uredaj, ulaz, split, zagreb } = await pripremi();
    await uredaj("A001");
    await uredaj("B001", { skladisteId: split.id });
    await expect(izdajDokument(prisma, skladistar, ulaz({ serijski: ["A001", "B001"] }), SADA)).rejects.toThrow(
      "Uređaj B001 nije u odabranom skladištu",
    );
    await expect(izdajDokument(prisma, skladistar, ulaz({ serijski: ["A001", "NEMA1"] }), SADA)).rejects.toThrow("Nisu u programu: NEMA1.");
    await expect(izdajDokument(prisma, skladistar, ulaz({ serijski: ["A001", "a001"] }), SADA)).rejects.toThrow("Upisan dvaput: A001.");
    await expect(izdajDokument(prisma, skladistar, ulaz({ skladisteUId: zagreb.id, serijski: ["A001"] }), SADA)).rejects.toThrow(
      "ne smije biti isto",
    );
    await expect(izdajDokument(prisma, skladistar, ulaz({ datum: "2026-09-26", serijski: ["A001"] }), SADA)).rejects.toThrow("budućnosti");
    await expect(izdajDokument(prisma, skladistar, ulaz({ serijski: [] }), SADA)).rejects.toThrow("barem jedan");
    expect((await izdajDokument(prisma, skladistar, ulaz({ serijski: ["A001"] }), SADA)).broj).toBe("MSK-1/2026");
  });
});

describe("izlaz i odobrenje", () => {
  it("izlaz čeka odobrenje; podnositelj ne može odobriti; drugi odobri → otpisan", async () => {
    const { skladistar, voditelj, uredaj, ulaz, firma } = await pripremi();
    const u = await uredaj("IZL001");
    const r = await izdajDokument(prisma, voditelj, ulaz({ vrsta: "IZLAZ", skladisteUId: null, razlog: "Oštećen", serijski: ["IZL001"] }), SADA);
    expect(r).toMatchObject({ broj: "IZL-1/2026", status: "CEKA_ODOBRENJE" });
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: u.id } })).stanje).toBe("NA_SKLADISTU");
    const o = await prisma.odobrenje.findFirstOrThrow({ where: { firmaId: firma.id } });
    await expect(odluciOZahtjevu(prisma, voditelj, o.id, true, null)).rejects.toThrow("vlastitom zahtjevu");
    // uređaj na čekanju ne može na drugi izlaz
    await expect(
      izdajDokument(prisma, skladistar, ulaz({ vrsta: "IZLAZ", skladisteUId: null, razlog: "Zastario", serijski: ["IZL001"] }), SADA),
    ).rejects.toThrow("čekaju odobrenje drugog dokumenta: IZL001 (IZL-1/2026)");
    await odluciOZahtjevu(prisma, skladistar, o.id, true, null);
    const nakon = await prisma.uredaj.findUniqueOrThrow({ where: { id: u.id } });
    expect(nakon).toMatchObject({ stanje: "OTPISAN", skladisteId: null });
    expect(await prisma.skladisniDokument.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "IZDAN" });
    expect(await prisma.odobrenje.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "ODOBRENO", odlucio: "Stjepan" });
    await expect(odluciOZahtjevu(prisma, voditelj, o.id, false, "x")).rejects.toThrow("već odlučeno");
  });

  it("odbijanje traži razlog i ne dira uređaje; uređaj pomaknut dok čeka → odobrenje ne uspije", async () => {
    const { voditelj, voditelj2, uredaj, ulaz, split, firma } = await pripremi();
    const u = await uredaj("IZL002");
    await izdajDokument(prisma, voditelj, ulaz({ vrsta: "IZLAZ", skladisteUId: null, razlog: "Zastario", serijski: ["IZL002"] }), SADA);
    const o = await prisma.odobrenje.findFirstOrThrow({ where: { firmaId: firma.id } });
    await expect(odluciOZahtjevu(prisma, voditelj2, o.id, false, " ")).rejects.toThrow("razlog odbijanja");
    await odluciOZahtjevu(prisma, voditelj2, o.id, false, "Još je ispravan");
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: u.id } })).stanje).toBe("NA_SKLADISTU");
    expect(await prisma.skladisniDokument.findFirstOrThrow({ where: { firmaId: firma.id } })).toMatchObject({ status: "ODBIJEN" });

    // novi izlaz; u međuvremenu uređaj prodan
    await izdajDokument(prisma, voditelj, ulaz({ vrsta: "IZLAZ", skladisteUId: null, razlog: "Zastario", serijski: ["IZL002"] }), SADA);
    const o2 = await prisma.odobrenje.findFirstOrThrow({ where: { firmaId: firma.id, status: "CEKA" } });
    const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac" } });
    await prisma.$transaction((tx) => promijeniStanje(tx, voditelj, [u.id], "prodaja", { partnerId: kupac.id }));
    await expect(odluciOZahtjevu(prisma, voditelj2, o2.id, true, null)).rejects.toThrow("radnja „otpis“ nije moguća");
    expect(await prisma.odobrenje.findUniqueOrThrow({ where: { id: o2.id } })).toMatchObject({ status: "CEKA" });
    void split;
  });
});

describe("povrat", () => {
  it("iz najma i otpisani na skladište; prodani ne", async () => {
    const { skladistar, uredaj, ulaz, split, firma } = await pripremi();
    const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Najmoprimac" } });
    const n = await uredaj("POV001", { stanje: "U_NAJMU", skladisteId: null, partnerId: kupac.id });
    const o = await uredaj("POV002", { stanje: "OTPISAN", skladisteId: null });
    await uredaj("POV003", { stanje: "PRODAN", skladisteId: null, partnerId: kupac.id });
    await expect(izdajDokument(prisma, skladistar, ulaz({ vrsta: "POVRAT", skladisteIzId: null, serijski: ["POV003"] }), SADA)).rejects.toThrow(
      "stornom računa",
    );
    const r = await izdajDokument(
      prisma,
      skladistar,
      ulaz({ vrsta: "POVRAT", skladisteIzId: null, partnerId: kupac.id, serijski: ["POV001", "POV002"] }),
      SADA,
    );
    expect(r.broj).toBe("POV-1/2026");
    for (const id of [n.id, o.id])
      expect(await prisma.uredaj.findUniqueOrThrow({ where: { id } })).toMatchObject({
        stanje: "NA_SKLADISTU",
        skladisteId: split.id,
        partnerId: null,
      });
    const radnje = await prisma.dogadajUredaja.findMany({ where: { dokumentId: r.id }, orderBy: { radnja: "asc" } });
    expect(radnje.map((x) => x.radnja)).toEqual(["ponistenjeOtpisa", "povratIzNajma"]);
  });
});
