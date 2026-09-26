import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_LOZINKA } from "../../prisma/demo/firme";
import { napuniDemo } from "../../prisma/demo";
import { ocistiBazu, testnaPrisma } from "@/test/baza";
import { brojRedaka, katalog } from "./kopije";
import { pravaClana, type Akter } from "./korisnici";
import { MATICNI, obrisiPodatke, ocistiDnevnik, odrzavanje, podjelaBrisanja, PROMET, UVIJEK_OSTAJE } from "./opasna-zona";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const d = await napuniDemo(prisma, { uredaja: 30, partnera: 6, racuna: 8, ugovora: 2 }, () => {});
  const akter = async (uloga: string, firmaId = d.firmaId): Promise<Akter> => {
    const korisnikId = d.korisnici[uloga]!;
    return { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))!, ip: null };
  };
  const partner = await prisma.partner.findFirstOrThrow({ where: { firmaId: d.firmaId } });
  const uredaj = await prisma.uredaj.findFirstOrThrow({ where: { firmaId: d.firmaId } });
  await prisma.prilog.createMany({
    data: [
      {
        firmaId: d.firmaId,
        entitet: "Partner",
        entitetId: partner.id,
        naziv: "p.pdf",
        vrsta: "application/pdf",
        velicina: 1,
        sadrzaj: Buffer.from("p"),
      },
      {
        firmaId: d.firmaId,
        entitet: "Uredaj",
        entitetId: uredaj.id,
        naziv: "u.pdf",
        vrsta: "application/pdf",
        velicina: 1,
        sadrzaj: Buffer.from("u"),
      },
    ],
  });
  const org = await prisma.mdmOrganizacija.create({ data: { firmaId: d.firmaId, naziv: "Org", vrsta: "KLIJENT", kodUpisa: "OZ-1" } });
  await prisma.mdmUredaj.create({
    data: {
      firmaId: d.firmaId,
      organizacijaId: org.id,
      uredajId: uredaj.id,
      serijski: uredaj.serijski,
      platforma: "WINDOWS",
      tokenHash: "t".repeat(64),
    },
  });
  return { d, akter };
}

describe("opasna zona", () => {
  it("svaka tablica firme je razvrstana (ostaje / matični / promet)", async () => {
    const t = await katalog(prisma);
    for (const x of t)
      if (x.ime !== "Prilog") expect([UVIJEK_OSTAJE.has(x.ime), MATICNI.has(x.ime), PROMET.has(x.ime)].filter(Boolean)).toHaveLength(1);
    expect(podjelaBrisanja(t, "SVE").ostaju).toEqual(UVIJEK_OSTAJE);
  });

  it("brisanje prometa: promet nestaje, matični podaci ostaju, druga firma netaknuta, kopija izrađena prije", async () => {
    const { d, akter } = await pripremi();
    const A = await akter("Administrator");
    const prije = await brojRedaka(prisma, d.firmaId);
    const druga = await brojRedaka(prisma, d.drugaFirmaId);
    expect(prije["ProdajniDokument"]).toBeGreaterThan(0);
    expect(prije["Uredaj"]).toBeGreaterThan(0);

    await expect(obrisiPodatke(prisma, A, { nacin: "PROMET", lozinka: "kriva", naziv: "Demo Informatika d.o.o." })).rejects.toThrow("Lozinka");
    await expect(obrisiPodatke(prisma, A, { nacin: "PROMET", lozinka: DEMO_LOZINKA, naziv: "Demo" })).rejects.toThrow("naziv");
    await expect(
      obrisiPodatke(prisma, await akter("Voditelj"), { nacin: "PROMET", lozinka: DEMO_LOZINKA, naziv: "Demo Informatika d.o.o." }),
    ).rejects.toThrow("pravo");
    expect(await brojRedaka(prisma, d.firmaId)).toEqual(prije);

    const r = await obrisiPodatke(prisma, A, { nacin: "PROMET", lozinka: DEMO_LOZINKA, naziv: " Demo Informatika d.o.o. " });
    const poslije = await brojRedaka(prisma, d.firmaId);
    for (const t of PROMET) expect(poslije[t] ?? 0, t).toBe(0);
    for (const t of MATICNI) expect(poslije[t] ?? 0, t).toBe(prije[t] ?? 0);
    expect(poslije["Prilog"]).toBe(1); // prilog partnera ostaje, uređaja nestaje
    expect(poslije["Dnevnik"]).toBe((prije["Dnevnik"] ?? 0) + 2); // kopija + brisanje
    expect((await prisma.mdmUredaj.findFirstOrThrow({ where: { firmaId: d.firmaId } })).uredajId).toBeNull();
    expect(await brojRedaka(prisma, d.drugaFirmaId)).toEqual(druga);
    expect(await prisma.sigurnosnaKopija.findUniqueOrThrow({ where: { id: r.kopijaId } })).toMatchObject({ firmaId: d.firmaId, vrsta: "RUCNA" });
    expect(r.obrisano).toBeGreaterThan(0);
  }, 120_000);

  it("brisanje svega: ostaju uloge, dnevnik i zadani šifrarnici; druga firma netaknuta; članstva i kopije ostaju", async () => {
    const { d, akter } = await pripremi();
    const A = await akter("Administrator");
    await prisma.firma.update({
      where: { id: d.firmaId },
      data: { logoId: (await prisma.logoFirme.create({ data: { firmaId: d.firmaId, vrsta: "image/png", sadrzaj: Buffer.from("x") } })).id },
    });
    const druga = await brojRedaka(prisma, d.drugaFirmaId);
    const clanstva = await prisma.clanstvoFirme.count({ where: { firmaId: d.firmaId } });
    await obrisiPodatke(prisma, A, { nacin: "SVE", lozinka: DEMO_LOZINKA, naziv: "Demo Informatika d.o.o." });
    const poslije = await brojRedaka(prisma, d.firmaId);
    expect(Object.keys(poslije).sort()).toEqual(["Dnevnik", "Kategorija", "Skladiste", "StanjeRobe", "Uloga"]);
    expect(poslije["Skladiste"]).toBe(1);
    expect((await prisma.firma.findUniqueOrThrow({ where: { id: d.firmaId } })).logoId).toBeNull();
    expect(await prisma.clanstvoFirme.count({ where: { firmaId: d.firmaId } })).toBe(clanstva);
    expect(await prisma.sigurnosnaKopija.count({ where: { firmaId: d.firmaId } })).toBe(1);
    expect(await brojRedaka(prisma, d.drugaFirmaId)).toEqual(druga);
  }, 120_000);

  it("fiskalizirani računi u produkciji se ne brišu", async () => {
    const { d, akter } = await pripremi();
    const rac = await prisma.prodajniDokument.findFirstOrThrow({ where: { firmaId: d.firmaId, vrsta: "RACUN" } });
    await prisma.prodajniDokument.update({ where: { id: rac.id }, data: { jir: "11111111-2222-3333-4444-555555555555" } });
    await prisma.firma.update({ where: { id: d.firmaId }, data: { fiskalNacin: "PRODUKCIJA" } });
    await expect(
      obrisiPodatke(prisma, await akter("Administrator"), { nacin: "PROMET", lozinka: DEMO_LOZINKA, naziv: "Demo Informatika d.o.o." }),
    ).rejects.toThrow("11 godina");
  }, 120_000);

  it("čišćenje dnevnika: samo stariji od granice (najmanje 12 mjeseci) i samo ova firma", async () => {
    const { d, akter } = await pripremi();
    const A = await akter("Administrator");
    const sada = new Date("2026-09-01T10:00:00Z");
    const zapis = (firmaId: string, vrijeme: string) => ({
      firmaId,
      korisnik: "T",
      radnja: "t",
      entitet: "Firma",
      opis: "t",
      promjene: [],
      pretraga: "t",
      vrijeme: new Date(vrijeme),
    });
    await prisma.dnevnik.createMany({
      data: [zapis(d.firmaId, "2024-01-01"), zapis(d.firmaId, "2025-08-01"), zapis(d.firmaId, "2025-10-01"), zapis(d.drugaFirmaId, "2020-01-01")],
    });
    const drugaPrije = await prisma.dnevnik.count({ where: { firmaId: d.drugaFirmaId } });
    await expect(ocistiDnevnik(prisma, A, { mjeseci: 6, lozinka: DEMO_LOZINKA }, sada)).rejects.toThrow("12");
    await expect(ocistiDnevnik(prisma, A, { mjeseci: 12, lozinka: "x" }, sada)).rejects.toThrow("Lozinka");
    expect(await ocistiDnevnik(prisma, A, { mjeseci: 12, lozinka: DEMO_LOZINKA }, sada)).toEqual({ obrisano: 2 });
    expect(await prisma.dnevnik.count({ where: { firmaId: d.firmaId, vrijeme: { lt: new Date("2025-09-01") } } })).toBe(0);
    expect(await prisma.dnevnik.count({ where: { firmaId: d.firmaId, radnja: "opasna.dnevnik" } })).toBe(1);
    expect(await prisma.dnevnik.count({ where: { firmaId: d.drugaFirmaId } })).toBe(drugaPrije);
  }, 120_000);

  it("održavanje briše samo istekle sesije i stare pokušaje prijave", async () => {
    const { d } = await pripremi();
    const sada = new Date("2026-09-01T10:00:00Z");
    const korisnikId = d.korisnici["Administrator"]!;
    const s = (id: string, istjece: string) => ({ id: id.padEnd(64, "0"), korisnikId, firmaId: d.firmaId, istjece: new Date(istjece) });
    await prisma.sesija.createMany({ data: [s("a", "2026-08-20"), s("b", "2026-09-10")] });
    await prisma.pokusajPrijave.createMany({
      data: [
        { email: "x", ip: "1", uspjeh: false, vrijeme: new Date("2026-07-01") },
        { email: "x", ip: "1", uspjeh: false, vrijeme: new Date("2026-08-31") },
      ],
    });
    expect(await odrzavanje(prisma, sada)).toBe(2);
    expect(await prisma.sesija.count()).toBe(1);
    expect(await prisma.pokusajPrijave.count()).toBe(1);
  }, 120_000);
});
