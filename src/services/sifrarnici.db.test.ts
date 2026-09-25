import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { procitajPolja } from "@/domain/polja";
import { sFirmom } from "@/lib/firma-db";
import { definicija } from "@/lib/sifrarnici";
import { opcijeOdabira, popisSifrarnika, zapisSifrarnika } from "@/queries/sifrarnici";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { napraviZadaneSifrarnike, obrisiSifrarnik, postaviAktivnost, spremiSifrarnik } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const MODELI = definicija("modeli")!;
const KATEGORIJE = definicija("kategorije")!;
const PROIZVODJACI = definicija("proizvodjaci")!;
const SKLADISTA = definicija("skladista")!;

async function akter(firmaId: string, korisnikId: string): Promise<Akter> {
  return { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
}

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const admin = await napraviKorisnika(prisma, firma.id, { uloga: "Administrator" });
  const prodavac = await napraviKorisnika(prisma, firma.id, { uloga: "Prodavač" });
  const A = await akter(firma.id, admin.id);
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id, naziv: "Prijenosno računalo" } });
  const lenovo = await spremiSifrarnik(prisma, A, PROIZVODJACI, null, { naziv: "Lenovo" });
  return { firma, A, P: await akter(firma.id, prodavac.id), kat, lenovo, db: sFirmom(prisma, firma.id) };
}

function unos(def: typeof MODELI, o: Record<string, string>) {
  const r = procitajPolja(def.polja, (ime) => o[ime] ?? null);
  if (!r.ok) throw new Error(JSON.stringify(r.polja));
  return r.vrijednosti;
}

describe("šifrarnici", () => {
  it("jedinstven naziv u firmi bez obzira na velika slova; druga firma smije isti", async () => {
    const { A } = await pripremi();
    await expect(spremiSifrarnik(prisma, A, PROIZVODJACI, null, { naziv: "LENOVO" })).rejects.toThrow("već postoji");
    const b = await napraviFirmu(prisma, "Firma B");
    const adminB = await napraviKorisnika(prisma, b.id);
    await spremiSifrarnik(prisma, await akter(b.id, adminB.id), PROIZVODJACI, null, { naziv: "Lenovo" });
  });

  it("dva ista unosa istovremeno: jedan zapis", async () => {
    const { A, firma } = await pripremi();
    const r = await Promise.allSettled([
      spremiSifrarnik(prisma, A, PROIZVODJACI, null, { naziv: "Dell" }),
      spremiSifrarnik(prisma, A, PROIZVODJACI, null, { naziv: "Dell" }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.proizvodjac.count({ where: { firmaId: firma.id, naziv: "Dell" } })).toBe(1);
  });

  it("model: isti naziv kod drugog proizvođača je dopušten, kod istog nije", async () => {
    const { A, kat, lenovo } = await pripremi();
    const hp = await spremiSifrarnik(prisma, A, PROIZVODJACI, null, { naziv: "HP" });
    await spremiSifrarnik(
      prisma,
      A,
      MODELI,
      null,
      unos(MODELI, { proizvodjacId: lenovo, naziv: "Pro 14", kategorijaId: kat.id, jamstvoMjeseci: "24" }),
    );
    await spremiSifrarnik(prisma, A, MODELI, null, unos(MODELI, { proizvodjacId: hp, naziv: "Pro 14", kategorijaId: kat.id, jamstvoMjeseci: "24" }));
    await expect(
      spremiSifrarnik(prisma, A, MODELI, null, unos(MODELI, { proizvodjacId: lenovo, naziv: "pro 14", kategorijaId: kat.id, jamstvoMjeseci: "24" })),
    ).rejects.toThrow("već postoji");
  });

  it("iznosi i postoci u bazi su točni Decimal; KPD normaliziran", async () => {
    const { A, kat, lenovo, db, firma } = await pripremi();
    const id = await spremiSifrarnik(
      prisma,
      A,
      MODELI,
      null,
      unos(MODELI, {
        proizvodjacId: lenovo,
        naziv: "T14",
        kategorijaId: kat.id,
        jamstvoMjeseci: "36",
        preporucenaCijena: "1.099,90",
        marza: "18,5",
        kpdProdaja: "262011",
      }),
    );
    const m = await prisma.modelUredaja.findUniqueOrThrow({ where: { id } });
    expect(m.preporucenaCijena?.toString()).toBe("1099.9");
    expect(m.marza?.toString()).toBe("18.5");
    expect(m.kpdProdaja).toBe("26.20.11");
    const z = await zapisSifrarnika(db, firma.id, MODELI, id, true);
    expect(z?.vrijednosti["preporucenaCijena"]).toBe(109990);
  });

  it("marža (nabavni podatak): bez prava se ne vidi, ne mijenja i ne ulazi u dnevnik vidljivo", async () => {
    const { A, kat, lenovo, db, firma } = await pripremi();
    const id = await spremiSifrarnik(
      prisma,
      A,
      MODELI,
      null,
      unos(MODELI, { proizvodjacId: lenovo, naziv: "T14", kategorijaId: kat.id, jamstvoMjeseci: "36", marza: "18" }),
    );
    // voditelj nema… ali administrator ima; uzmimo korisnika sa sifrarnici=operativno bez costs
    const u = await prisma.uloga.create({
      data: { firmaId: firma.id, naziv: "Šifrarnici bez cijena", prava: { moduli: { sifrarnici: "operativno" }, posebna: {} } },
    });
    const k = await napraviKorisnika(prisma, firma.id);
    await prisma.clanstvoFirme.updateMany({ where: { korisnikId: k.id }, data: { ulogaId: u.id } });
    const bez = await akter(firma.id, k.id);
    const vrijednosti = { ...unos(MODELI, { proizvodjacId: lenovo, naziv: "T14", kategorijaId: kat.id, jamstvoMjeseci: "36" }), marza: 99_00 };
    await spremiSifrarnik(prisma, bez, MODELI, id, vrijednosti);
    expect((await prisma.modelUredaja.findUniqueOrThrow({ where: { id } })).marza?.toString()).toBe("18");
    expect((await zapisSifrarnika(db, firma.id, MODELI, id, false))?.vrijednosti).not.toHaveProperty("marza");
    const popis = await popisSifrarnika(
      db,
      firma.id,
      MODELI,
      { aktivnost: [], sort: { kljuc: "naziv", smjer: "asc" }, stranica: 1, velicina: 50 },
      false,
    );
    expect(popis.redovi[0]?.vrijednosti).not.toHaveProperty("marza");
  });

  it("deaktivirana referenca se ne nudi i ne može se odabrati za novi zapis; stari zapis je zadržava", async () => {
    const { A, kat, lenovo, db, firma } = await pripremi();
    const id = await spremiSifrarnik(
      prisma,
      A,
      MODELI,
      null,
      unos(MODELI, { proizvodjacId: lenovo, naziv: "T14", kategorijaId: kat.id, jamstvoMjeseci: "36" }),
    );
    await postaviAktivnost(prisma, A, PROIZVODJACI, lenovo, false);
    const opcije = await opcijeOdabira(db, firma.id, MODELI);
    expect(opcije["proizvodjacId"]?.find((o) => o.vrijednost === lenovo)).toBeUndefined();
    await expect(
      spremiSifrarnik(prisma, A, MODELI, null, unos(MODELI, { proizvodjacId: lenovo, naziv: "E16", kategorijaId: kat.id, jamstvoMjeseci: "24" })),
    ).rejects.toThrow("deaktivirana");
    // postojeći model se i dalje može spremiti (proizvođač nepromijenjen)
    await spremiSifrarnik(
      prisma,
      A,
      MODELI,
      id,
      unos(MODELI, { proizvodjacId: lenovo, naziv: "T14 Gen 4", kategorijaId: kat.id, jamstvoMjeseci: "36" }),
    );
    expect(
      (await opcijeOdabira(db, firma.id, MODELI, { proizvodjacId: lenovo }))["proizvodjacId"]?.some((o) => o.naziv.includes("deaktiviran")),
    ).toBe(true);
  });

  it("brisanje samo neiskorištenog; iskorišteni traži deaktivaciju; povijest ostaje", async () => {
    const { A, kat, lenovo } = await pripremi();
    await spremiSifrarnik(prisma, A, MODELI, null, unos(MODELI, { proizvodjacId: lenovo, naziv: "T14", kategorijaId: kat.id, jamstvoMjeseci: "36" }));
    await expect(obrisiSifrarnik(prisma, A, PROIZVODJACI, lenovo)).rejects.toThrow("deaktivirajte");
    await expect(obrisiSifrarnik(prisma, A, KATEGORIJE, kat.id)).rejects.toThrow("deaktivirajte");
    const prazan = await spremiSifrarnik(prisma, A, PROIZVODJACI, null, { naziv: "Asus" });
    await obrisiSifrarnik(prisma, A, PROIZVODJACI, prazan);
    expect(await prisma.proizvodjac.count({ where: { id: prazan } })).toBe(0);
    expect(await prisma.dnevnik.count({ where: { entitetId: prazan } })).toBe(2);
  });

  it("samo jedno zadano skladište", async () => {
    const { A, firma } = await pripremi();
    await spremiSifrarnik(prisma, A, SKLADISTA, null, { naziv: "Split", adresa: null, zadano: true });
    expect((await prisma.skladiste.findMany({ where: { firmaId: firma.id, zadano: true } })).map((s) => s.naziv)).toEqual(["Split"]);
  });

  it("firma A ne mijenja, ne deaktivira i ne briše šifrarnik firme B; ne koristi tuđu referencu", async () => {
    const { A, kat } = await pripremi();
    const b = await napraviFirmu(prisma, "Firma B");
    await napraviZadaneSifrarnike(prisma, b.id);
    const adminB = await napraviKorisnika(prisma, b.id);
    const dellB = await spremiSifrarnik(prisma, await akter(b.id, adminB.id), PROIZVODJACI, null, { naziv: "Dell" });
    await expect(spremiSifrarnik(prisma, A, PROIZVODJACI, dellB, { naziv: "Moj" })).rejects.toThrow("ne postoji");
    await expect(postaviAktivnost(prisma, A, PROIZVODJACI, dellB, false)).rejects.toThrow("ne postoji");
    await expect(obrisiSifrarnik(prisma, A, PROIZVODJACI, dellB)).rejects.toThrow("ne postoji");
    await expect(
      spremiSifrarnik(prisma, A, MODELI, null, unos(MODELI, { proizvodjacId: dellB, naziv: "X", kategorijaId: kat.id, jamstvoMjeseci: "12" })),
    ).rejects.toThrow("ne postoji");
  });

  it("neispravan id (nije UUID) daje poruku, ne grešku baze", async () => {
    const { A } = await pripremi();
    await expect(postaviAktivnost(prisma, A, PROIZVODJACI, "x' OR 1=1", false)).rejects.toThrow("ne postoji");
  });

  it("popis: pretraga, aktivnost, stranice", async () => {
    const { A, db, firma } = await pripremi();
    for (const n of ["Dell", "Asus", "Acer", "Apple"]) await spremiSifrarnik(prisma, A, PROIZVODJACI, null, { naziv: n });
    const acer = (await prisma.proizvodjac.findFirstOrThrow({ where: { naziv: "Acer" } })).id;
    await postaviAktivnost(prisma, A, PROIZVODJACI, acer, false);
    const f = { sort: { kljuc: "naziv" as const, smjer: "asc" as const }, stranica: 1, velicina: 2 };
    const aktivni = await popisSifrarnika(db, firma.id, PROIZVODJACI, { ...f, aktivnost: ["aktivni"] }, true);
    expect(aktivni.ukupno).toBe(4);
    expect(aktivni.redovi.map((r) => r.vrijednosti["naziv"])).toEqual(["Apple", "Asus"]);
    const trazi = await popisSifrarnika(db, firma.id, PROIZVODJACI, { ...f, aktivnost: [], trazi: "a" }, true);
    expect(trazi.ukupno).toBe(3);
    const neaktivni = await popisSifrarnika(db, firma.id, PROIZVODJACI, { ...f, aktivnost: ["neaktivni"] }, true);
    expect(neaktivni.redovi.map((r) => r.vrijednosti["naziv"])).toEqual(["Acer"]);
  });
});
