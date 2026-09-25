import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnosPartnera } from "@/domain/partner-unos";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import {
  aktivnostPartnera,
  cijenaZaKupca,
  dohvatiPodatkeTvrtke,
  obrisiPartnera,
  postaviCijenu,
  provjeriViesPartnera,
  spremiCjenik,
  spremiPartnera,
  spremiPoslovnicu,
} from "./partneri";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));
afterEach(() => vi.unstubAllGlobals());

const osnova: UnosPartnera = {
  naziv: "Primjer d.o.o.",
  kupac: true,
  dobavljac: false,
  drzava: "HR",
  oib: "69435151530",
  pdvBroj: "HR69435151530",
  adresa: "Ilica 1",
  postanskiBroj: "10000",
  mjesto: "Zagreb",
  email: null,
  telefon: null,
  eRacunAdresa: "9934:69435151530",
  pdvStatus: null,
  rokPlacanjaDana: 15,
  cjenikId: null,
  napomena: null,
};

async function pripremi() {
  const firma = await napraviFirmu(prisma, "Firma A");
  const admin = await napraviKorisnika(prisma, firma.id);
  const A: Akter = { firmaId: firma.id, korisnikId: admin.id, prava: (await pravaClana(prisma, firma.id, admin.id))! };
  return { firma, A };
}

async function modelSCijenom(firmaId: string, cijena: string) {
  const p = await prisma.proizvodjac.create({ data: { firmaId, naziv: `P${Math.random()}` } });
  const k = await prisma.kategorija.create({ data: { firmaId, naziv: `K${Math.random()}` } });
  return prisma.modelUredaja.create({ data: { firmaId, naziv: "M", proizvodjacId: p.id, kategorijaId: k.id, preporucenaCijena: cijena } });
}

describe("partneri", () => {
  it("OIB je jedinstven u firmi (i kod istovremenog unosa); druga firma smije isti OIB", async () => {
    const { A } = await pripremi();
    const r = await Promise.allSettled([spremiPartnera(prisma, A, null, osnova), spremiPartnera(prisma, A, null, { ...osnova, naziv: "Drugi" })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(spremiPartnera(prisma, A, null, osnova)).rejects.toThrow("već postoji: Primjer d.o.o.");
    const b = await napraviFirmu(prisma, "Firma B");
    const adminB = await napraviKorisnika(prisma, b.id);
    await spremiPartnera(prisma, { firmaId: b.id, korisnikId: adminB.id, prava: (await pravaClana(prisma, b.id, adminB.id))! }, null, osnova);
  });

  it("promjena PDV broja poništava raniju VIES provjeru", async () => {
    const { A } = await pripremi();
    const id = await spremiPartnera(prisma, A, null, osnova);
    await prisma.partner.update({ where: { id }, data: { viesValjan: true, viesProvjereno: new Date() } });
    await spremiPartnera(prisma, A, id, { ...osnova, naziv: "Novo ime" });
    expect((await prisma.partner.findUniqueOrThrow({ where: { id } })).viesValjan).toBe(true);
    await spremiPartnera(prisma, A, id, { ...osnova, pdvBroj: null });
    expect((await prisma.partner.findUniqueOrThrow({ where: { id } })).viesValjan).toBeNull();
  });

  it("cjenik druge firme ili deaktiviran cjenik ne može se dodijeliti", async () => {
    const { A } = await pripremi();
    const b = await napraviFirmu(prisma, "Firma B");
    const tudji = await prisma.cjenik.create({ data: { firmaId: b.id, naziv: "Tuđi" } });
    await expect(spremiPartnera(prisma, A, null, { ...osnova, cjenikId: tudji.id })).rejects.toThrow("Cjenik ne postoji.");
    const moj = await spremiCjenik(prisma, A, null, { naziv: "Moj", opis: null, popust: null, aktivan: false });
    await expect(spremiPartnera(prisma, A, null, { ...osnova, cjenikId: moj })).rejects.toThrow("deaktiviran");
  });

  it("poslovnica: samo na partneru vlastite firme; brisanje partnera briše i poslovnice; dnevnik", async () => {
    const { A, firma } = await pripremi();
    const id = await spremiPartnera(prisma, A, null, osnova);
    await spremiPoslovnicu(prisma, A, id, null, { naziv: "Split", adresa: null, postanskiBroj: null, mjesto: "Split", kontakt: null, telefon: null });
    const b = await napraviFirmu(prisma, "Firma B");
    const tudji = await prisma.partner.create({ data: { firmaId: b.id, naziv: "Tuđi" } });
    await expect(
      spremiPoslovnicu(prisma, A, tudji.id, null, { naziv: "X", adresa: null, postanskiBroj: null, mjesto: null, kontakt: null, telefon: null }),
    ).rejects.toThrow("Partner ne postoji.");
    await obrisiPartnera(prisma, A, id);
    expect(await prisma.poslovnica.count({ where: { firmaId: firma.id } })).toBe(0);
    expect(await prisma.dnevnik.count({ where: { entitet: "Partner", entitetId: id } })).toBe(3);
  });

  it("deaktivacija", async () => {
    const { A } = await pripremi();
    const id = await spremiPartnera(prisma, A, null, osnova);
    await aktivnostPartnera(prisma, A, id, false);
    expect((await prisma.partner.findUniqueOrThrow({ where: { id } })).aktivan).toBe(false);
  });
});

describe("cijena za kupca", () => {
  it("stavka cjenika > popust cjenika > preporučena cijena; zaokruživanje na cent", async () => {
    const { A, firma } = await pripremi();
    const m1 = await modelSCijenom(firma.id, "1099.00");
    const m2 = await modelSCijenom(firma.id, "9.99");
    const cj = await spremiCjenik(prisma, A, null, { naziv: "Veleprodaja", opis: null, popust: 5_50, aktivan: true });
    await postaviCijenu(prisma, A, cj, { modelId: m1.id }, 999_00);
    const kupac = await spremiPartnera(prisma, A, null, { ...osnova, cjenikId: cj });
    const bez = await spremiPartnera(prisma, A, null, { ...osnova, oib: null, pdvBroj: null, naziv: "Bez cjenika" });

    expect(await cijenaZaKupca(prisma, firma.id, kupac, { modelId: m1.id })).toBe(999_00);
    // 9,99 € − 5,5 % = 9,44055 € → 9,44 €
    expect(await cijenaZaKupca(prisma, firma.id, kupac, { modelId: m2.id })).toBe(9_44);
    expect(await cijenaZaKupca(prisma, firma.id, bez, { modelId: m1.id })).toBe(1099_00);
    expect(await cijenaZaKupca(prisma, firma.id, null, { modelId: m1.id })).toBe(1099_00);

    await spremiCjenik(prisma, A, cj, { naziv: "Veleprodaja", opis: null, popust: 5_50, aktivan: false });
    expect(await cijenaZaKupca(prisma, firma.id, kupac, { modelId: m1.id })).toBe(1099_00);
  });

  it("uklanjanje cijene iz cjenika; model druge firme se ne može dodati", async () => {
    const { A, firma } = await pripremi();
    const m1 = await modelSCijenom(firma.id, "100.00");
    const cj = await spremiCjenik(prisma, A, null, { naziv: "C", opis: null, popust: null, aktivan: true });
    await postaviCijenu(prisma, A, cj, { modelId: m1.id }, 90_00);
    await postaviCijenu(prisma, A, cj, { modelId: m1.id }, 80_00);
    expect(await prisma.stavkaCjenika.count({ where: { cjenikId: cj } })).toBe(1);
    await postaviCijenu(prisma, A, cj, { modelId: m1.id }, null);
    expect(await prisma.stavkaCjenika.count({ where: { cjenikId: cj } })).toBe(0);
    const b = await napraviFirmu(prisma, "Firma B");
    const tudji = await modelSCijenom(b.id, "1.00");
    await expect(postaviCijenu(prisma, A, cj, { modelId: tudji.id }, 1_00)).rejects.toThrow("ne postoji");
  });
});

describe("dohvat podataka tvrtke (VIES)", () => {
  it("valjan PDV broj puni podatke; nevaljan daje poruku", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ isValid: true, userError: "VALID", name: "MUSTER GMBH", address: "HAUPTSTRASSE 5\n80331 MÜNCHEN" })),
    );
    expect(await dohvatiPodatkeTvrtke("DE", null, "DE123456789")).toMatchObject({
      naziv: "MUSTER GMBH",
      mjesto: "München",
      viesValjan: true,
      izvor: "VIES",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ isValid: false, userError: "INVALID" })));
    await expect(dohvatiPodatkeTvrtke("DE", null, "DE123456789")).rejects.toThrow("nije valjan");
  });

  it("bez interneta: ljudska poruka", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(dohvatiPodatkeTvrtke("HR", "69435151530", null)).rejects.toThrow(/nije dostupan.*ručno/);
  });

  it("VIES provjera spremljenog partnera sprema rezultat", async () => {
    const { A } = await pripremi();
    const id = await spremiPartnera(prisma, A, null, osnova);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ isValid: true, userError: "VALID" })));
    expect(await provjeriViesPartnera(prisma, A, id)).toBe(true);
    const p = await prisma.partner.findUniqueOrThrow({ where: { id } });
    expect(p.viesValjan).toBe(true);
    expect(p.viesProvjereno).not.toBeNull();
  });
});

describe("popis partnera (upit)", () => {
  it("svako sortiranje u oba smjera i svi filtri rade nad bazom", async () => {
    const { A, firma } = await pripremi();
    await spremiPartnera(prisma, A, null, osnova);
    await spremiPartnera(prisma, A, null, { ...osnova, oib: null, pdvBroj: null, naziv: "Bez mjesta", mjesto: null, kupac: false, dobavljac: true });
    const { popisPartnera } = await import("@/queries/partneri");
    const db = (await import("@/lib/firma-db")).sFirmom(prisma, firma.id);
    for (const kljuc of ["naziv", "mjesto", "stvoreno"] as const) {
      for (const smjer of ["asc", "desc"] as const) {
        const r = await popisPartnera(db, firma.id, { vrsta: [], aktivnost: [], sort: { kljuc, smjer }, stranica: 1, velicina: 25 });
        expect(r.ukupno).toBe(2);
      }
    }
    const mjesto = await popisPartnera(db, firma.id, {
      vrsta: [],
      aktivnost: [],
      sort: { kljuc: "mjesto", smjer: "desc" },
      stranica: 1,
      velicina: 25,
    });
    expect(mjesto.redovi.at(-1)?.naziv).toBe("Bez mjesta"); // prazno mjesto na kraju i kod silaznog
    const dobavljaci = await popisPartnera(db, firma.id, {
      vrsta: ["dobavljaci"],
      aktivnost: ["aktivni"],
      trazi: "bez",
      sort: { kljuc: "naziv", smjer: "asc" },
      stranica: 1,
      velicina: 25,
    });
    expect(dobavljaci.redovi.map((p) => p.naziv)).toEqual(["Bez mjesta"]);
    const poOibu = await popisPartnera(db, firma.id, {
      vrsta: [],
      aktivnost: [],
      trazi: "6943",
      sort: { kljuc: "naziv", smjer: "asc" },
      stranica: 1,
      velicina: 25,
    });
    expect(poOibu.ukupno).toBe(1);
  });
});
