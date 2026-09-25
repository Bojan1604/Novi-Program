import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { promijeniStanje, type Izvrsitelj } from "./uredaji";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { ime: "Skladištar" });
  const skladiste = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const drugo = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "Split" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Lenovo" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "T14", proizvodjacId: p.id, kategorijaId: kat.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o." } });
  const uredaj = (serijski: string) =>
    prisma.uredaj.create({ data: { firmaId: firma.id, serijski, modelId: model.id, stanje: "NA_SKLADISTU", skladisteId: skladiste.id } });
  const I: Izvrsitelj = { firmaId: firma.id, korisnikId: k.id };
  return { firma, I, skladiste, drugo, kupac, uredaj, model };
}

describe("promjena stanja uređaja", () => {
  it("prodaja: stanje, kupac, uređaj više nije na skladištu, događaj u povijesti s dokumentom", async () => {
    const { I, kupac, uredaj } = await pripremi();
    const u = await uredaj("SN1");
    await prisma.$transaction((tx) =>
      promijeniStanje(tx, I, [u.id], "prodaja", { partnerId: kupac.id, dokument: { vrsta: "Racun", broj: "1-1-1" } }),
    );
    const n = await prisma.uredaj.findUniqueOrThrow({ where: { id: u.id } });
    expect(n).toMatchObject({ stanje: "PRODAN", partnerId: kupac.id, skladisteId: null, verzija: 1 });
    const d = await prisma.dogadajUredaja.findFirstOrThrow({ where: { uredajId: u.id } });
    expect(d).toMatchObject({
      radnja: "prodaja",
      staroStanje: "NA_SKLADISTU",
      novoStanje: "PRODAN",
      dokumentVrsta: "Racun",
      dokumentBroj: "1-1-1",
      korisnik: "Skladištar",
    });
  });

  it("nedopušten prijelaz: razlog, ništa se ne mijenja (ni ostali uređaji iz iste radnje)", async () => {
    const { I, kupac, uredaj } = await pripremi();
    const a = await uredaj("SN-A");
    const b = await uredaj("SN-B");
    await prisma.$transaction((tx) => promijeniStanje(tx, I, [b.id], "prodaja", { partnerId: kupac.id }));
    await expect(prisma.$transaction((tx) => promijeniStanje(tx, I, [a.id, b.id], "najam", { partnerId: kupac.id }))).rejects.toThrow(
      "Uređaj SN-B je „Prodan“ — radnja „davanje u najam“ nije moguća",
    );
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: a.id } })).stanje).toBe("NA_SKLADISTU");
    expect(await prisma.dogadajUredaja.count({ where: { uredajId: a.id } })).toBe(0);
  });

  it("dvije kartice istovremeno: jedna prodaje, druga daje u najam — uspije samo jedna", async () => {
    const { I, kupac, uredaj } = await pripremi();
    const u = await uredaj("SN-UTRKA");
    const r = await Promise.allSettled([
      prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "prodaja", { partnerId: kupac.id })),
      prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "najam", { partnerId: kupac.id })),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.dogadajUredaja.count({ where: { uredajId: u.id } })).toBe(1);
  });

  it("servis vraća u stanje prije servisa (najam ostaje kod istog klijenta)", async () => {
    const { I, kupac, uredaj } = await pripremi();
    const u = await uredaj("SN-S");
    await prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "najam", { partnerId: kupac.id }));
    await prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "ulazNaServis", {}));
    expect(await prisma.uredaj.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({
      stanje: "NA_SERVISU",
      stanjePrijeServisa: "U_NAJMU",
      partnerId: kupac.id,
    });
    await prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "izlazSaServisa", {}));
    expect(await prisma.uredaj.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({
      stanje: "U_NAJMU",
      stanjePrijeServisa: null,
      partnerId: kupac.id,
    });
  });

  it("povrat iz najma traži skladište i briše kupca", async () => {
    const { I, kupac, uredaj, drugo } = await pripremi();
    const u = await uredaj("SN-P");
    await prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "najam", { partnerId: kupac.id }));
    await expect(prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "povratIzNajma", {}))).rejects.toThrow("odaberite skladište");
    await prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "povratIzNajma", { skladisteId: drugo.id }));
    expect(await prisma.uredaj.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({
      stanje: "NA_SKLADISTU",
      partnerId: null,
      skladisteId: drugo.id,
    });
  });

  it("prodaja bez kupca nije moguća", async () => {
    const { I, uredaj } = await pripremi();
    const u = await uredaj("SN-K");
    await expect(prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "prodaja", {}))).rejects.toThrow("odaberite kupca");
  });

  it("međuskladišnica mijenja samo skladište, stanje ostaje", async () => {
    const { I, uredaj, drugo } = await pripremi();
    const u = await uredaj("SN-M");
    await prisma.$transaction((tx) => promijeniStanje(tx, I, [u.id], "medjuskladisnica", { skladisteId: drugo.id }));
    expect(await prisma.uredaj.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ stanje: "NA_SKLADISTU", skladisteId: drugo.id });
  });

  it("uređaj druge firme se ne može mijenjati", async () => {
    const { uredaj } = await pripremi();
    const u = await uredaj("SN-T");
    const b = await napraviFirmu(prisma, "B");
    const kb = await napraviKorisnika(prisma, b.id);
    await expect(prisma.$transaction((tx) => promijeniStanje(tx, { firmaId: b.id, korisnikId: kb.id }, [u.id], "otpis", {}))).rejects.toThrow(
      "ne postoje",
    );
  });
});
