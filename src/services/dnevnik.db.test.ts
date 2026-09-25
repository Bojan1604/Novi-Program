import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MASKA } from "@/domain/dnevnik";
import { sFirmom } from "@/lib/firma-db";
import { stranicaDnevnika } from "@/queries/dnevnik";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { zapisiDnevnik } from "./dnevnik";
import { dodajKorisnika, postaviLozinku, pravaClana, spremiUlogu, urediKorisnika } from "./korisnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma, "Firma A");
  const admin = await napraviKorisnika(prisma, firma.id, { ime: "Ana Admin" });
  const A = { firmaId: firma.id, korisnikId: admin.id, prava: (await pravaClana(prisma, firma.id, admin.id))!, ip: "10.0.0.1" };
  return { firma, admin, A, db: sFirmom(prisma, firma.id) };
}

describe("svaka promjena ostavlja zapis", () => {
  it("dodavanje, izmjena i lozinka korisnika; tko, kada, razlika", async () => {
    const { firma, A, db } = await pripremi();
    const { korisnikId } = await dodajKorisnika(prisma, A, {
      ime: "Iva",
      email: "iva@a.hr",
      lozinka: "Dobra-lozinka-1",
      ulogaId: firma.uloge["Prodavač"]!,
    });
    await urediKorisnika(prisma, A, korisnikId, { ime: "Iva Ivić", ulogaId: firma.uloge["Serviser"]! });
    await postaviLozinku(prisma, A, korisnikId, "Druga-lozinka-2");

    const { zapisi, ukupno } = await stranicaDnevnika(db, firma.id, { stranica: 1, entitet: "Korisnik", entitetId: korisnikId }, true);
    expect(ukupno).toBe(3);
    const [lozinka, izmjena, dodan] = zapisi;
    expect(dodan?.opis).toContain("Dodan korisnik Iva");
    expect(dodan?.korisnik).toBe("Ana Admin");
    expect(izmjena?.promjene).toEqual(
      expect.arrayContaining([
        { polje: "ime", staro: "Iva", novo: "Iva Ivić" },
        { polje: "uloga", staro: "Prodavač", novo: "Serviser" },
      ]),
    );
    expect(lozinka?.promjene).toEqual([{ polje: "lozinka", staro: "(skriveno)", novo: "(promijenjeno)" }]);
    // hash lozinke se nikad ne upisuje u dnevnik
    const sve = JSON.stringify(await prisma.dnevnik.findMany());
    expect(sve).not.toMatch(/\$2[aby]\$/);
    expect(sve).not.toContain("Druga-lozinka-2");
  });

  it("izmjena uloge zapisuje prava koja su se promijenila", async () => {
    const { firma, A, db } = await pripremi();
    const id = firma.uloge["Prodavač"]!;
    const prava = (await pravaClana(prisma, firma.id, A.korisnikId))!;
    await spremiUlogu(prisma, A, {
      id,
      naziv: "Prodavač",
      opis: "",
      prava: { ...prava, moduli: { ...prava.moduli, korisnici: "nema" }, posebna: { costs: false, log: false, opasnaZona: false } },
    });
    const { zapisi } = await stranicaDnevnika(db, firma.id, { stranica: 1, entitet: "Uloga" }, true);
    expect(zapisi[0]?.promjene.find((p) => p.polje === "Prodaja")).toEqual({ polje: "Prodaja", staro: "operativno", novo: "puno" });
  });

  it("neuspjela radnja ne ostavlja zapis (zapis je u istoj transakciji)", async () => {
    const { firma, A } = await pripremi();
    await expect(
      prisma.$transaction(async (tx) => {
        await zapisiDnevnik(tx, { firmaId: firma.id, korisnikId: A.korisnikId, radnja: "x", entitet: "X", opis: "pokušaj" });
        throw new Error("radnja pukla");
      }),
    ).rejects.toThrow();
    expect(await prisma.dnevnik.count({ where: { opis: "pokušaj" } })).toBe(0);
  });
});

describe("nabavne cijene u dnevniku", () => {
  async function sNabavnom() {
    const p = await pripremi();
    await zapisiDnevnik(prisma, {
      firmaId: p.firma.id,
      korisnikId: p.admin.id,
      radnja: "uredaji.uredi",
      entitet: "Uredaj",
      entitetId: "u1",
      opis: "Izmjena uređaja SN123",
      staro: { napomena: "stara", nabavnaCijena: "100.00" },
      novo: { napomena: "nova", nabavnaCijena: "120.00" },
    });
    return p;
  }

  it("korisnik bez prava vidi masku, s pravom vidi iznos", async () => {
    const { firma, db } = await sNabavnom();
    const bez = await stranicaDnevnika(db, firma.id, { stranica: 1 }, false);
    expect(bez.zapisi[0]?.promjene.find((p) => p.polje === "nabavnaCijena")).toMatchObject({ staro: MASKA, novo: MASKA });
    expect(JSON.stringify(bez)).not.toContain("120.00");
    const s = await stranicaDnevnika(db, firma.id, { stranica: 1 }, true);
    expect(s.zapisi[0]?.promjene.find((p) => p.polje === "nabavnaCijena")).toMatchObject({ staro: "100.00", novo: "120.00" });
  });

  it("pretraga po iznosu nabavne cijene ne pronalazi zapis (ne otkriva iznos)", async () => {
    const { firma, db } = await sNabavnom();
    expect((await stranicaDnevnika(db, firma.id, { stranica: 1, trazi: "120.00" }, false)).ukupno).toBe(0);
    expect((await stranicaDnevnika(db, firma.id, { stranica: 1, trazi: "sn123" }, false)).ukupno).toBe(1);
  });
});

describe("filtri i stranice", () => {
  it("od–do po datumu u Zagrebu, stranice", async () => {
    const { firma, admin, db } = await pripremi();
    const z = (vrijeme: string, opis: string) =>
      prisma.dnevnik.create({
        data: { firmaId: firma.id, korisnikId: admin.id, korisnik: "Ana", radnja: "x", entitet: "X", opis, vrijeme: new Date(vrijeme) },
      });
    await z("2026-03-31T21:59:00Z", "31. ožujka 23:59"); // Zagreb ljeto +2
    await z("2026-03-31T22:00:00Z", "1. travnja 00:00");
    await z("2026-04-30T21:59:00Z", "30. travnja 23:59");
    await z("2026-04-30T22:00:00Z", "1. svibnja 00:00");
    const travanj = await stranicaDnevnika(db, firma.id, { stranica: 1, od: "2026-04-01", do: "2026-04-30" }, true);
    expect(travanj.zapisi.map((x) => x.opis)).toEqual(["30. travnja 23:59", "1. travnja 00:00"]);

    for (let i = 0; i < 25; i++) await z(`2026-05-01T10:${String(i).padStart(2, "0")}:00Z`, `z${i}`);
    const s2 = await stranicaDnevnika(db, firma.id, { stranica: 2, velicina: 10, od: "2026-05-01" }, true);
    expect(s2.ukupno).toBe(26); // 25 + „1. svibnja 00:00“
    expect(s2.zapisi.map((x) => x.opis)).toEqual(Array.from({ length: 10 }, (_, i) => `z${14 - i}`));
  });

  it("firma B ne vidi dnevnik firme A", async () => {
    const { firma } = await pripremi();
    await zapisiDnevnik(prisma, { firmaId: firma.id, korisnikId: null, radnja: "x", entitet: "X", opis: "tajno A" });
    const b = await napraviFirmu(prisma, "Firma B");
    const r = await stranicaDnevnika(sFirmom(prisma, b.id), b.id, { stranica: 1 }, true);
    expect(r.ukupno).toBe(0);
    // i kad se pokuša s id-em firme A kroz klijent firme B
    expect((await stranicaDnevnika(sFirmom(prisma, b.id), firma.id, { stranica: 1 }, true)).ukupno).toBe(0);
  });
});
