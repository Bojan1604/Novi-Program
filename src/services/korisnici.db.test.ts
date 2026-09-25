import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { praznaPrava, punaPrava, type Prava } from "@/domain/prava";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma, TESTNA_LOZINKA } from "@/test/baza";
import { dodajKorisnika, obrisiUlogu, postaviLozinku, pravaClana, spremiUlogu, urediKorisnika, type Akter } from "./korisnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function akter(firmaId: string, korisnikId: string): Promise<Akter> {
  return { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
}

async function pripremi() {
  const firma = await napraviFirmu(prisma, "Firma A");
  const admin = await napraviKorisnika(prisma, firma.id, { ime: "Admin", uloga: "Administrator" });
  const admin2 = await napraviKorisnika(prisma, firma.id, { ime: "Admin 2", uloga: "Administrator" });
  const voditelj = await napraviKorisnika(prisma, firma.id, { ime: "Voditelj", uloga: "Voditelj" });
  const prodavac = await napraviKorisnika(prisma, firma.id, { ime: "Prodavač", uloga: "Prodavač" });
  return { firma, admin, admin2, voditelj, prodavac, A: await akter(firma.id, admin.id) };
}

/** Upravitelj korisnika koji NIJE administrator: korisnici=puno, ali bez nabavnih cijena. */
async function upravitelj(firmaId: string) {
  const prava: Prava = { ...praznaPrava(), moduli: { ...praznaPrava().moduli, korisnici: "puno", prodaja: "puno", nadzorna: "pregled" } };
  const u = await prisma.uloga.create({ data: { firmaId, naziv: "Upravitelj", prava } });
  const k = await napraviKorisnika(prisma, firmaId, { ime: "Upravitelj" });
  await prisma.clanstvoFirme.updateMany({ where: { korisnikId: k.id }, data: { ulogaId: u.id } });
  return { korisnik: k, akter: await akter(firmaId, k.id), ulogaId: u.id };
}

describe("dodavanje korisnika", () => {
  it("administrator dodaje korisnika s ulogom", async () => {
    const { firma, A } = await pripremi();
    const r = await dodajKorisnika(prisma, A, { ime: "Nova", email: "Nova@Firma.hr", lozinka: "Dobra-lozinka-1", ulogaId: firma.uloge["Prodavač"]! });
    expect(r.postojeci).toBe(false);
    const p = await pravaClana(prisma, firma.id, r.korisnikId);
    expect(p?.moduli.prodaja).toBe("operativno");
    expect((await prisma.korisnik.findUniqueOrThrow({ where: { id: r.korisnikId } })).email).toBe("nova@firma.hr");
  });

  it("voditelj (korisnici=pregled) ne može dodati korisnika", async () => {
    const { firma, voditelj } = await pripremi();
    await expect(
      dodajKorisnika(prisma, await akter(firma.id, voditelj.id), {
        ime: "X",
        email: "x@x.hr",
        lozinka: "Dobra-lozinka-1",
        ulogaId: firma.uloge["Prodavač"]!,
      }),
    ).rejects.toThrow(/pravo/);
  });

  it("korisnik iz druge firme dobije samo članstvo; lozinka mu ostaje", async () => {
    const { firma, A } = await pripremi();
    const b = await napraviFirmu(prisma, "Firma B");
    const iz_b = await napraviKorisnika(prisma, b.id, { email: "zajednicki@x.hr" });
    const r = await dodajKorisnika(prisma, A, {
      ime: "Drugo ime",
      email: "zajednicki@x.hr",
      lozinka: "Nova-lozinka-99",
      ulogaId: firma.uloge["Serviser"]!,
    });
    expect(r).toEqual({ korisnikId: iz_b.id, postojeci: true });
    const k = await prisma.korisnik.findUniqueOrThrow({ where: { id: iz_b.id } });
    expect(await bcrypt.compare(TESTNA_LOZINKA, k.lozinkaHash)).toBe(true);
    expect(k.ime).not.toBe("Drugo ime");
  });

  it("ne može dodati korisnika s ulogom druge firme", async () => {
    const { A } = await pripremi();
    const b = await napraviFirmu(prisma, "Firma B");
    await expect(
      dodajKorisnika(prisma, A, { ime: "X", email: "x@x.hr", lozinka: "Dobra-lozinka-1", ulogaId: b.uloge["Administrator"]! }),
    ).rejects.toThrow(/ulogu/);
  });

  it("dva ista dodavanja istovremeno: jedan korisnik", async () => {
    const { firma, A } = await pripremi();
    const ulaz = { ime: "Dupli", email: "dupli@x.hr", lozinka: "Dobra-lozinka-1", ulogaId: firma.uloge["Prodavač"]! };
    const r = await Promise.allSettled([dodajKorisnika(prisma, A, ulaz), dodajKorisnika(prisma, A, ulaz)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.korisnik.count({ where: { email: "dupli@x.hr" } })).toBe(1);
  });
});

describe("preuzimanje računa administratora (stvarna greška s prethodnog projekta)", () => {
  it("ne-administrator s pravom na korisnike ne može promijeniti lozinku administratoru", async () => {
    const { firma, admin } = await pripremi();
    const u = await upravitelj(firma.id);
    await expect(postaviLozinku(prisma, u.akter, admin.id, "Preuzeto-12345")).rejects.toThrow(/prava koja vi nemate/);
    const k = await prisma.korisnik.findUniqueOrThrow({ where: { id: admin.id } });
    expect(await bcrypt.compare(TESTNA_LOZINKA, k.lozinkaHash)).toBe(true);
  });

  it("ne može isključiti administratora ni promijeniti mu ulogu", async () => {
    const { firma, admin } = await pripremi();
    const u = await upravitelj(firma.id);
    await expect(urediKorisnika(prisma, u.akter, admin.id, { aktivno: false })).rejects.toThrow();
    await expect(urediKorisnika(prisma, u.akter, admin.id, { ulogaId: firma.uloge["Prodavač"]! })).rejects.toThrow();
  });

  it("ne može sebi dodijeliti prava (ni kroz ulogu ni kroz iznimke)", async () => {
    const { firma } = await pripremi();
    const u = await upravitelj(firma.id);
    await expect(urediKorisnika(prisma, u.akter, u.korisnik.id, { ulogaId: firma.uloge["Administrator"]! })).rejects.toThrow(/vlastita/);
    await expect(urediKorisnika(prisma, u.akter, u.korisnik.id, { iznimke: { posebna: { costs: true } } })).rejects.toThrow(/vlastita/);
  });

  it("ne može drugome dati prava koja sam nema", async () => {
    const { firma } = await pripremi();
    const u = await upravitelj(firma.id);
    const slab = await napraviKorisnika(prisma, firma.id);
    const praznaUloga = await prisma.uloga.create({ data: { firmaId: firma.id, naziv: "Prazna", prava: praznaPrava() } });
    await prisma.clanstvoFirme.updateMany({ where: { korisnikId: slab.id }, data: { ulogaId: praznaUloga.id } });
    await expect(urediKorisnika(prisma, u.akter, slab.id, { iznimke: { posebna: { costs: true } } })).rejects.toThrow(/sami nemate/);
    await urediKorisnika(prisma, u.akter, slab.id, { iznimke: { moduli: { prodaja: "operativno" } } });
    expect((await pravaClana(prisma, firma.id, slab.id))?.moduli.prodaja).toBe("operativno");
  });

  it("ne može napraviti ulogu jaču od sebe", async () => {
    const { firma } = await pripremi();
    const u = await upravitelj(firma.id);
    await expect(spremiUlogu(prisma, u.akter, { naziv: "Jača", opis: "", prava: punaPrava() })).rejects.toThrow(/sami nemate/);
  });
});

describe("izmjena korisnika", () => {
  it("administrator smije promijeniti vlastito ime (prava ostaju)", async () => {
    const { firma, admin, A } = await pripremi();
    const clan = await prisma.clanstvoFirme.findFirstOrThrow({ where: { korisnikId: admin.id } });
    await urediKorisnika(prisma, A, admin.id, { ime: "Novo Ime", ulogaId: clan.ulogaId, iznimke: {}, aktivno: true });
    expect((await prisma.korisnik.findUniqueOrThrow({ where: { id: admin.id } })).ime).toBe("Novo Ime");
    expect((await pravaClana(prisma, firma.id, admin.id))?.moduli.korisnici).toBe("puno");
  });

  it("ne može isključiti sam sebe", async () => {
    const { admin, A } = await pripremi();
    await expect(urediKorisnika(prisma, A, admin.id, { aktivno: false })).rejects.toThrow(/sami sebe/);
  });

  it("zadnji aktivni administrator se ne može isključiti ni ražalovati", async () => {
    const { firma, admin, admin2, A } = await pripremi();
    // admin2 isključuje admina dok postoje dvojica — dopušteno
    const A2 = await akter(firma.id, admin2.id);
    await urediKorisnika(prisma, A2, admin.id, { aktivno: false });
    // sad je admin2 jedini aktivni administrator; admin (isključen, ali akter iz stare sesije) ga ne može ražalovati
    await expect(urediKorisnika(prisma, A, admin2.id, { ulogaId: firma.uloge["Prodavač"]! })).rejects.toThrow(/barem jednog/);
    await expect(urediKorisnika(prisma, A, admin2.id, { aktivno: false })).rejects.toThrow(/barem jednog/);
  });

  it("isključenje odmah briše sesije korisnika u firmi", async () => {
    const { firma, prodavac, A } = await pripremi();
    await prisma.sesija.create({ data: { id: "a".repeat(64), korisnikId: prodavac.id, firmaId: firma.id, istjece: new Date(Date.now() + 1e9) } });
    await urediKorisnika(prisma, A, prodavac.id, { aktivno: false });
    expect(await prisma.sesija.count({ where: { korisnikId: prodavac.id } })).toBe(0);
  });

  it("iznimka mijenja stvarna prava", async () => {
    const { firma, prodavac, A } = await pripremi();
    await urediKorisnika(prisma, A, prodavac.id, { iznimke: { moduli: { prodaja: "pregled" }, posebna: { costs: true } } });
    const p = await pravaClana(prisma, firma.id, prodavac.id);
    expect(p?.moduli.prodaja).toBe("pregled");
    expect(p?.posebna.costs).toBe(true);
  });

  it("administrator firme A ne može mijenjati korisnika firme B", async () => {
    const { A } = await pripremi();
    const b = await napraviFirmu(prisma, "Firma B");
    const kb = await napraviKorisnika(prisma, b.id, { uloga: "Prodavač" });
    await expect(urediKorisnika(prisma, A, kb.id, { aktivno: false })).rejects.toThrow(/nije član/);
    await expect(postaviLozinku(prisma, A, kb.id, "Preuzeto-12345")).rejects.toThrow(/nije član/);
  });
});

describe("lozinka", () => {
  it("administrator postavlja lozinku i korisnik je odjavljen svugdje", async () => {
    const { firma, prodavac, A } = await pripremi();
    await prisma.sesija.create({ data: { id: "b".repeat(64), korisnikId: prodavac.id, firmaId: firma.id, istjece: new Date(Date.now() + 1e9) } });
    await postaviLozinku(prisma, A, prodavac.id, "Nova-lozinka-123");
    const k = await prisma.korisnik.findUniqueOrThrow({ where: { id: prodavac.id } });
    expect(await bcrypt.compare("Nova-lozinka-123", k.lozinkaHash)).toBe(true);
    expect(await prisma.sesija.count({ where: { korisnikId: prodavac.id } })).toBe(0);
  });

  it("korisniku koji radi i u drugoj firmi lozinku ne mijenja administrator jedne firme", async () => {
    const { firma, A } = await pripremi();
    const b = await napraviFirmu(prisma, "Firma B");
    const kb = await napraviKorisnika(prisma, b.id, { uloga: "Administrator" });
    await prisma.clanstvoFirme.create({ data: { firmaId: firma.id, korisnikId: kb.id, ulogaId: firma.uloge["Prodavač"]! } });
    await expect(postaviLozinku(prisma, A, kb.id, "Preuzeto-12345")).rejects.toThrow(/drugoj firmi/);
  });

  it("slaba lozinka se odbija", async () => {
    const { prodavac, A } = await pripremi();
    await expect(postaviLozinku(prisma, A, prodavac.id, "kratka")).rejects.toThrow(/najmanje 10/);
  });
});

describe("uloge", () => {
  it("nova uloga; isti naziv (bez obzira na velika slova) je odbijen", async () => {
    const { firma, A } = await pripremi();
    const id = await spremiUlogu(prisma, A, { naziv: "Skladište noću", opis: "", prava: praznaPrava() });
    expect(await prisma.uloga.count({ where: { id, firmaId: firma.id } })).toBe(1);
    await expect(spremiUlogu(prisma, A, { naziv: "skladište NOĆU", opis: "", prava: praznaPrava() })).rejects.toThrow(/već postoji/);
  });

  it("Administrator (sustavna) se ne mijenja ni briše", async () => {
    const { firma, A } = await pripremi();
    const id = firma.uloge["Administrator"]!;
    await expect(spremiUlogu(prisma, A, { id, naziv: "Administrator", opis: "", prava: praznaPrava() })).rejects.toThrow(/ne može/);
    await expect(obrisiUlogu(prisma, A, id)).rejects.toThrow(/ne može/);
  });

  it("uloga u upotrebi se ne briše; prazna se briše", async () => {
    const { firma, A } = await pripremi();
    await expect(obrisiUlogu(prisma, A, firma.uloge["Prodavač"]!)).rejects.toThrow(/korisnik/);
    await obrisiUlogu(prisma, A, firma.uloge["Knjigovođa"]!);
    expect(await prisma.uloga.count({ where: { id: firma.uloge["Knjigovođa"]! } })).toBe(0);
  });

  it("izmjena uloge mijenja prava svih korisnika s tom ulogom", async () => {
    const { firma, prodavac, A } = await pripremi();
    const p = { ...praznaPrava(), moduli: { ...praznaPrava().moduli, prodaja: "pregled" as const } };
    await spremiUlogu(prisma, A, { id: firma.uloge["Prodavač"]!, naziv: "Prodavač", opis: "", prava: p });
    expect((await pravaClana(prisma, firma.id, prodavac.id))?.moduli.najam).toBe("nema");
  });

  it("ne može mijenjati ulogu koju sam ima", async () => {
    const { firma } = await pripremi();
    const u = await upravitelj(firma.id);
    await expect(spremiUlogu(prisma, u.akter, { id: u.ulogaId, naziv: "Upravitelj", opis: "", prava: u.akter.prava })).rejects.toThrow(
      /i sami imate/,
    );
  });

  it("administrator firme A ne vidi i ne mijenja uloge firme B", async () => {
    const { A } = await pripremi();
    const b = await napraviFirmu(prisma, "Firma B");
    await expect(spremiUlogu(prisma, A, { id: b.uloge["Prodavač"]!, naziv: "X", opis: "", prava: praznaPrava() })).rejects.toThrow(/ne postoji/);
    await expect(obrisiUlogu(prisma, A, b.uloge["Knjigovođa"]!)).rejects.toThrow(/ne postoji/);
  });
});
