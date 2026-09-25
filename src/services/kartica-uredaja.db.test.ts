import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sFirmom } from "@/lib/firma-db";
import { karticaUredaja } from "@/queries/uredaji";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { dodajPriloge, obrisiPrilog } from "./prilozi";
import { zaprimi } from "./primke";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { ispraviUredaj, obrisiUredaj, promijeniStanje, stvoriUredaje } from "./uredaji";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const akter = async (uloga: string): Promise<Akter> => {
    const k = await napraviKorisnika(prisma, firma.id, { uloga, ime: uloga });
    return { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  };
  const admin = await akter("Administrator");
  const skladistar = await akter("Skladištar");
  const skladiste = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "Latitude 5440", proizvodjacId: p.id, kategorijaId: kat.id } });
  const drugiModel = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "Latitude 7440", proizvodjacId: p.id, kategorijaId: kat.id },
  });
  const primka = await zaprimi(
    prisma,
    admin,
    {
      datum: "2026-09-25",
      skladisteId: skladiste.id,
      dobavljacId: null,
      stanjeRobeId: null,
      dokumentDobavljaca: null,
      napomena: null,
      knjiziUTroskove: false,
      stavke: [
        { serijski: "DL001", modelId: model.id, nabavnaCijena: 500_00, cpu: "i5" },
        { serijski: "DL002", modelId: model.id, nabavnaCijena: 500_00 },
      ],
    },
    SADA,
  );
  const u1 = await prisma.uredaj.findFirstOrThrow({ where: { serijski: "DL001" } });
  return { firma, admin, skladistar, skladiste, model, drugiModel, primka, u1 };
}

describe("ispravak uređaja", () => {
  it("ispravlja dopuštena polja, povećava verziju i piše dnevnik (nabavna maskirana za skladištara)", async () => {
    const { admin, u1, drugiModel, firma, skladistar } = await pripremi();
    await ispraviUredaj(prisma, admin, u1.id, {
      verzija: u1.verzija,
      serijski: " dl001x ",
      modelId: drugiModel.id,
      cpu: "i7",
      nabavnaCijena: 450_00,
      jamstvoDo: "2028-01-31",
    });
    const u = await prisma.uredaj.findUniqueOrThrow({ where: { id: u1.id } });
    expect(u).toMatchObject({ serijski: "DL001X", modelId: drugiModel.id, cpu: "i7", verzija: u1.verzija + 1, stanje: "NA_SKLADISTU" });
    expect(u.nabavnaCijena?.toString()).toBe("450");
    expect(u.jamstvoDo?.toISOString().slice(0, 10)).toBe("2028-01-31");
    const z = await prisma.dnevnik.findFirstOrThrow({ where: { firmaId: firma.id, radnja: "uredaji.ispravak" } });
    expect(z.opis).toBe("Ispravak uređaja DL001: serijski broj, model, nabavna cijena, jamstvo do, procesor");
    const k = await karticaUredaja(sFirmom(prisma, firma.id), firma.id, u1.id, false);
    const nabavna = k!.ispravci[0]!.promjene.find((p) => p.polje === "nabavnaCijena");
    expect(nabavna).toMatchObject({ staro: "•••", novo: "•••" });
    expect(k!.nabavnaCijena).toBeNull();
    // skladištar (bez prava na nabavne) ne može mijenjati nabavnu
    const v = u.verzija;
    await expect(ispraviUredaj(prisma, skladistar, u1.id, { verzija: v, nabavnaCijena: 1_00 })).rejects.toThrow(
      "Nemate pravo mijenjati nabavnu cijenu.",
    );
    await ispraviUredaj(prisma, skladistar, u1.id, { verzija: v, napomena: "ogrebotina" });
  });

  it("zastarjela verzija, ništa promijenjeno, dupli serijski, neispravan model", async () => {
    const { admin, u1, firma } = await pripremi();
    await expect(ispraviUredaj(prisma, admin, u1.id, { verzija: u1.verzija + 5, cpu: "x" })).rejects.toThrow("Netko je u međuvremenu");
    await expect(ispraviUredaj(prisma, admin, u1.id, { verzija: u1.verzija, cpu: "i5" })).rejects.toThrow("Ništa nije promijenjeno.");
    await expect(ispraviUredaj(prisma, admin, u1.id, { verzija: u1.verzija, serijski: "dl002" })).rejects.toThrow(
      "Serijski broj DL002 već ima drugi uređaj.",
    );
    await expect(ispraviUredaj(prisma, admin, u1.id, { verzija: u1.verzija, modelId: "0190a000-0000-7000-8000-000000000000" })).rejects.toThrow(
      "Model ne postoji.",
    );
    await expect(ispraviUredaj(prisma, admin, u1.id, { verzija: u1.verzija, serijski: "a" })).rejects.toThrow("prekratak");
    const drugaFirma = await napraviFirmu(prisma, "Druga d.o.o.");
    const tudji = await prisma.modelUredaja.create({
      data: {
        firmaId: drugaFirma.id,
        naziv: "Tuđi",
        proizvodjacId: (await prisma.proizvodjac.create({ data: { firmaId: drugaFirma.id, naziv: "X" } })).id,
        kategorijaId: (await prisma.kategorija.create({ data: { firmaId: drugaFirma.id, naziv: "K" } })).id,
      },
    });
    await expect(ispraviUredaj(prisma, admin, u1.id, { verzija: u1.verzija, modelId: tudji.id })).rejects.toThrow("Model ne postoji.");
    expect(await prisma.dnevnik.count({ where: { firmaId: firma.id, radnja: "uredaji.ispravak" } })).toBe(0);
  });

  it("uređaj na dokumentu: serijski i model zaključani, specifikacija se smije ispraviti", async () => {
    const { admin, u1, drugiModel, firma } = await pripremi();
    const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o." } });
    await prisma.$transaction((tx) =>
      promijeniStanje(tx, admin, [u1.id], "prodaja", { partnerId: kupac.id, dokument: { vrsta: "Račun", broj: "R-1/2026" } }),
    );
    const u = await prisma.uredaj.findUniqueOrThrow({ where: { id: u1.id } });
    await expect(ispraviUredaj(prisma, admin, u1.id, { verzija: u.verzija, serijski: "NOVI123" })).rejects.toThrow(
      "Serijski broj i model ne mogu se mijenjati jer je uređaj na dokumentima: Račun R-1/2026.",
    );
    await expect(ispraviUredaj(prisma, admin, u1.id, { verzija: u.verzija, modelId: drugiModel.id })).rejects.toThrow("Račun R-1/2026");
    // isti serijski (bez promjene) prolazi zajedno s ispravkom specifikacije
    await ispraviUredaj(prisma, admin, u1.id, { verzija: u.verzija, serijski: "DL001", ram: "16 GB" });
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: u1.id } })).ram).toBe("16 GB");
    const k = await karticaUredaja(sFirmom(prisma, firma.id), firma.id, u1.id, true);
    expect(k!.dopusteno).not.toContain("serijski");
    expect(k!.zakljucano).toContain("Račun R-1/2026");
  });
});

describe("brisanje uređaja", () => {
  it("s primke ne; bez veza da — briše i povijest i priloge", async () => {
    const { admin, u1, firma, model } = await pripremi();
    await expect(obrisiUredaj(prisma, admin, u1.id)).rejects.toThrow("uklanja se stornom primke");
    const [id] = await prisma.$transaction((tx) =>
      stvoriUredaje(
        tx,
        admin,
        "najava",
        [{ serijski: "NAJAVA1", modelId: model.id, nabavnaCijena: null, nabavniDatum: null, jamstvoDo: null, stanjeRobeId: null }],
        {
          skladisteId: null,
        },
      ),
    );
    await dodajPriloge(prisma, admin, "Uredaj", id!, [{ naziv: "slika.png", velicina: 3, sadrzaj: new Uint8Array([1, 2, 3]) }]);
    await obrisiUredaj(prisma, admin, id!);
    expect(await prisma.uredaj.count({ where: { id } })).toBe(0);
    expect(await prisma.dogadajUredaja.count({ where: { uredajId: id } })).toBe(0);
    expect(await prisma.prilog.count({ where: { entitetId: id } })).toBe(0);
    expect(await prisma.dnevnik.count({ where: { firmaId: firma.id, radnja: "uredaji.obrisi", entitetId: id } })).toBe(1);
  });

  it("najavljen pa na dokumentu → ne", async () => {
    const { admin, model } = await pripremi();
    const [id] = await prisma.$transaction((tx) =>
      stvoriUredaje(
        tx,
        admin,
        "najava",
        [{ serijski: "NAJAVA2", modelId: model.id, nabavnaCijena: null, nabavniDatum: null, jamstvoDo: null, stanjeRobeId: null }],
        {
          skladisteId: null,
          dokument: { vrsta: "Narudžbenica", broj: "N-3/2026" },
        },
      ),
    );
    await expect(obrisiUredaj(prisma, admin, id!)).rejects.toThrow("Narudžbenica N-3/2026");
  });
});

describe("prilozi", () => {
  it("dodaje, provjerava vrstu i vlasnika, briše; sve u dnevniku", async () => {
    const { admin, u1, firma } = await pripremi();
    const n = await dodajPriloge(prisma, admin, "Uredaj", u1.id, [
      { naziv: "C:\\slike\\račun.pdf", velicina: 4, sadrzaj: new Uint8Array([37, 80, 68, 70]) },
      { naziv: "foto.JPG", velicina: 2, sadrzaj: new Uint8Array([1, 2]) },
    ]);
    expect(n).toBe(2);
    const prilozi = await prisma.prilog.findMany({ where: { entitetId: u1.id }, orderBy: { naziv: "asc" } });
    expect(prilozi.map((p) => [p.naziv, p.vrsta, p.korisnik])).toEqual([
      ["foto.JPG", "image/jpeg", "Administrator"],
      ["račun.pdf", "application/pdf", "Administrator"],
    ]);
    await expect(dodajPriloge(prisma, admin, "Uredaj", u1.id, [{ naziv: "x.exe", velicina: 1, sadrzaj: new Uint8Array([1]) }])).rejects.toThrow(
      "nije dopuštena",
    );
    await expect(dodajPriloge(prisma, admin, "Uredaj", u1.id, [{ naziv: "x.pdf", velicina: 5, sadrzaj: new Uint8Array([1]) }])).rejects.toThrow(
      "nije potpuno poslana",
    );
    await expect(dodajPriloge(prisma, admin, "Racun", u1.id, [{ naziv: "x.pdf", velicina: 1, sadrzaj: new Uint8Array([1]) }])).rejects.toThrow(
      "Zapis ne postoji.",
    );
    await expect(dodajPriloge(prisma, admin, "Uredaj", u1.id, [])).rejects.toThrow("Odaberite datoteku.");

    // uređaj druge firme
    const druga = await napraviFirmu(prisma, "Druga d.o.o.");
    const tudji: Akter = { ...admin, firmaId: druga.id };
    await expect(dodajPriloge(prisma, tudji, "Uredaj", u1.id, [{ naziv: "x.pdf", velicina: 1, sadrzaj: new Uint8Array([1]) }])).rejects.toThrow(
      "Zapis ne postoji.",
    );
    await expect(obrisiPrilog(prisma, tudji, "Uredaj", prilozi[0]!.id)).rejects.toThrow("Prilog ne postoji.");

    await obrisiPrilog(prisma, admin, "Uredaj", prilozi[0]!.id);
    expect(await prisma.prilog.count({ where: { entitetId: u1.id } })).toBe(1);
    const zapisi = await prisma.dnevnik.findMany({ where: { firmaId: firma.id, entitet: "Uredaj", entitetId: u1.id }, orderBy: { vrijeme: "asc" } });
    expect(zapisi.map((z) => z.radnja)).toEqual(["prilozi.dodaj", "prilozi.dodaj", "prilozi.obrisi"]);
  });
});

describe("kartica", () => {
  it("povijest s nazivima skladišta, prilozi bez sadržaja, brisanje s razlogom", async () => {
    const { admin, u1, firma, skladiste } = await pripremi();
    const drugo = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "Split" } });
    await prisma.$transaction((tx) => promijeniStanje(tx, admin, [u1.id], "medjuskladisnica", { skladisteId: drugo.id }));
    await dodajPriloge(prisma, admin, "Uredaj", u1.id, [{ naziv: "a.txt", velicina: 1, sadrzaj: new Uint8Array([65]) }]);
    const k = (await karticaUredaja(sFirmom(prisma, firma.id), firma.id, u1.id, true))!;
    expect(k.dogadaji.map((d) => [d.radnja, d.skladisteOd, d.skladisteDo])).toEqual([
      ["medjuskladisnica", skladiste.naziv, "Split"],
      ["zaprimanje", null, skladiste.naziv],
    ]);
    expect(k.ukupnoDogadaja).toBe(2);
    expect(k.prilozi[0]).not.toHaveProperty("sadrzaj");
    expect(k.nabavnaCijena).toBe(500_00);
    expect(k.brisanje).toContain("PRI-1/2026");
    expect(await karticaUredaja(sFirmom(prisma, firma.id), firma.id, "nije-uuid", true)).toBeNull();
    const druga = await napraviFirmu(prisma, "Druga d.o.o.");
    expect(await karticaUredaja(sFirmom(prisma, druga.id), druga.id, u1.id, true)).toBeNull();
  });
});
