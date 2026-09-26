import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { procitajUpis } from "@/domain/mdm";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import {
  agentPoTokenu,
  javiSe,
  noviKodUpisa,
  organizacijaPartnera,
  postaviStanjeMdmUredaja,
  spremiOrganizaciju,
  upisiUredaj,
  vidljiveOrganizacijePartnera,
} from "./mdm";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const v = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: v.id, prava: (await pravaClana(prisma, firma.id, v.id))! };
  const [p1, p2, p3] = await Promise.all(
    ["Distributer 1", "Distributer 2", "Klijent 1"].map((naziv) => prisma.partner.create({ data: { firmaId: firma.id, naziv } })),
  );
  const d1 = await spremiOrganizaciju(prisma, A, null, { naziv: "D1", vrsta: "DISTRIBUTER", nadredenaId: null, partnerId: p1!.id, aktivna: true });
  const k1 = await spremiOrganizaciju(prisma, A, null, { naziv: "K1", vrsta: "KLIJENT", nadredenaId: d1, partnerId: p3!.id, aktivna: true });
  const d2 = await spremiOrganizaciju(prisma, A, null, { naziv: "D2", vrsta: "DISTRIBUTER", nadredenaId: null, partnerId: p2!.id, aktivna: true });
  const k2 = await spremiOrganizaciju(prisma, A, null, { naziv: "K2", vrsta: "KLIJENT", nadredenaId: d2, partnerId: null, aktivna: true });
  const kod = async (id: string) => (await prisma.mdmOrganizacija.findUniqueOrThrow({ where: { id } })).kodUpisa;
  const upis = async (id: string, serijski: string) => {
    const r = procitajUpis({ kod: await kod(id), serijski, platforma: "ANDROID", model: "Galaxy Tab" });
    if (!r.ok) throw new Error(r.greska);
    return upisiUredaj(prisma, r.vrijednost, "10.0.0.9");
  };
  return { firma, A, p1: p1!, p2: p2!, p3: p3!, d1, k1, d2, k2, kod, upis };
}

describe("MDM osnove", () => {
  it("organizacije: klijent ne može imati podređene ni biti nadređen", async () => {
    const { A, k1, d1 } = await pripremi();
    await expect(
      spremiOrganizaciju(prisma, A, null, { naziv: "X", vrsta: "KLIJENT", nadredenaId: k1, partnerId: null, aktivna: true }),
    ).rejects.toThrow("distributer");
    await expect(
      spremiOrganizaciju(prisma, A, d1, { naziv: "D1", vrsta: "KLIJENT", nadredenaId: null, partnerId: null, aktivna: true }),
    ).rejects.toThrow("podređene");
  });

  it("upis kodom, javljanje tokenom, ponovni upis poništava stari token, blokiran nema pristup, novi kod poništava stari", async () => {
    const { A, firma, k1, kod, upis } = await pripremi();
    await prisma.uredaj.create({
      data: { firmaId: firma.id, serijski: "TAB-1", modelId: (await napraviModel(firma.id)).id, stanje: "PRODAN" },
    });
    const u = await upis(k1, "tab-1");
    const m = await prisma.mdmUredaj.findUniqueOrThrow({ where: { id: u.id } });
    expect(m).toMatchObject({ serijski: "TAB-1", organizacijaId: k1, platforma: "ANDROID" });
    expect(m.uredajId).not.toBeNull();
    expect(m.tokenHash).not.toBe(u.token);
    expect(await javiSe(prisma, u.token, { baterija: 81, slobodno: "12 GB" })).toEqual({ id: u.id });
    expect((await prisma.mdmUredaj.findUniqueOrThrow({ where: { id: u.id } })).izvjestaj).toEqual({ baterija: 81, slobodno: "12 GB" });
    expect(await javiSe(prisma, "krivi-token-krivi-token-krivi", {})).toBeNull();

    const u2 = await upis(k1, "TAB-1");
    expect(u2.id).toBe(u.id);
    expect(await agentPoTokenu(prisma, u.token)).toBeNull();
    expect(await agentPoTokenu(prisma, u2.token)).not.toBeNull();

    await postaviStanjeMdmUredaja(prisma, A, u.id, "BLOKIRAN");
    expect(await javiSe(prisma, u2.token, {})).toBeNull();
    await expect(upis(k1, "TAB-1")).rejects.toThrow("blokiran");

    const stari = await kod(k1);
    await noviKodUpisa(prisma, A, k1);
    const r = procitajUpis({ kod: stari, serijski: "TAB-2", platforma: "WINDOWS" });
    if (!r.ok) throw new Error(r.greska);
    await expect(upisiUredaj(prisma, r.vrijednost, null)).rejects.toThrow("Kod upisa nije ispravan");
    expect(await prisma.dnevnik.count({ where: { firmaId: firma.id, entitet: "MdmUredaj" } })).toBe(3);
  });

  it("distributer vidi samo svoje organizacije i uređaje; klijent samo sebe; druga firma ništa", async () => {
    const { firma, p1, p2, p3, d1, k1, d2, k2, upis } = await pripremi();
    await upis(k1, "A-1");
    await upis(k2, "B-1");
    expect((await vidljiveOrganizacijePartnera(prisma, firma.id, p1.id)).map((o) => o.naziv).sort()).toEqual(["D1", "K1"]);
    expect((await vidljiveOrganizacijePartnera(prisma, firma.id, p2.id)).map((o) => o.naziv).sort()).toEqual(["D2", "K2"]);
    expect((await vidljiveOrganizacijePartnera(prisma, firma.id, p3.id)).map((o) => o.naziv)).toEqual(["K1"]);
    expect((await organizacijaPartnera(prisma, firma.id, p1.id, k1))!.uredaji.map((u) => u.serijski)).toEqual(["A-1"]);
    expect(await organizacijaPartnera(prisma, firma.id, p1.id, k2)).toBeNull();
    expect(await organizacijaPartnera(prisma, firma.id, p1.id, d2)).toBeNull();
    expect(await organizacijaPartnera(prisma, firma.id, p3.id, d1)).toBeNull();
    const druga = await napraviFirmu(prisma);
    expect(await organizacijaPartnera(prisma, druga.id, p1.id, d1)).toBeNull();
  });
});

async function napraviModel(firmaId: string) {
  const p = await prisma.proizvodjac.create({ data: { firmaId, naziv: "Samsung" } });
  const kat = await prisma.kategorija.create({ data: { firmaId, naziv: "Tableti" } });
  return prisma.modelUredaja.create({ data: { firmaId, naziv: "Tab", proizvodjacId: p.id, kategorijaId: kat.id } });
}
