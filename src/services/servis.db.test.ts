import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { provjeriDosljednost } from "./dosljednost";
import { pravaClana, type Akter } from "./korisnici";
import { dodajUredajeNaUgovor, izdajRate, spremiUgovor, vratiUredaj } from "./najam";
import { izdajZamjenu, obrisiNalog, promijeniStatusServisa, spremiDijagnozu, vratiZamjenu, zaprimiNaServis, zavrsiNalog } from "./servis";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const v = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: v.id, prava: (await pravaClana(prisma, firma.id, v.id))! };
  const s = await napraviKorisnika(prisma, firma.id, { uloga: "Serviser" });
  const SRV: Akter = { firmaId: firma.id, korisnikId: s.id, prava: (await pravaClana(prisma, firma.id, s.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o.", oib: "69435151530" } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "LaserJet", proizvodjacId: p.id, kategorijaId: kat.id, kpdProdaja: "28.23.21", kpdNajam: "77.33.11" },
  });
  const uredaj = (serijski: string, x: { stanje?: "NA_SKLADISTU" | "PRODAN"; partnerId?: string } = {}) =>
    prisma.uredaj.create({
      data: {
        firmaId: firma.id,
        serijski,
        modelId: model.id,
        stanje: x.stanje ?? "NA_SKLADISTU",
        skladisteId: x.stanje === "PRODAN" ? null : skl.id,
        partnerId: x.partnerId ?? null,
      },
    });
  const stanje = async (serijski: string) =>
    prisma.uredaj.findFirstOrThrow({ where: { firmaId: firma.id, serijski }, select: { stanje: true, partnerId: true, skladisteId: true } });
  const prijem = (a: Akter, serijski: string, datum = "2026-02-10") =>
    zaprimiNaServis(prisma, a, { serijski, opisKvara: "Ne pali se", datum, skladisteId: null, kontakt: null });
  return { firma, A, SRV, skl, kupac, uredaj, stanje, prijem };
}

describe("servisni nalog", () => {
  it("uređaj sa skladišta: prijem, statusi, dijagnoza, povrat na skladište; drugi otvoreni nalog za isti uređaj odbijen", async () => {
    const { A, SRV, skl, uredaj, stanje, prijem, firma } = await pripremi();
    await uredaj("S-1");
    const n = await prijem(SRV, "S-1");
    expect(n.broj).toBe("SRV-1/2026");
    expect(await stanje("S-1")).toMatchObject({ stanje: "NA_SERVISU", skladisteId: skl.id });
    await expect(prijem(SRV, "S-1")).rejects.toThrow("Na servisu");
    await promijeniStatusServisa(prisma, SRV, n.id, { status: "DIJAGNOZA", poruka: "Provjeravamo napajanje", verzija: 0 });
    await expect(promijeniStatusServisa(prisma, SRV, n.id, { status: "POPRAVAK", poruka: null, verzija: 0 })).rejects.toThrow("Osvježite");
    await spremiDijagnozu(prisma, SRV, n.id, { dijagnoza: "Pregorio osigurač", napomenaKlijentu: "Mijenja se napajanje", verzija: 1 });
    await expect(zavrsiNalog(prisma, SRV, n.id, { ishod: "OTPISAN", datum: "2026-02-12", skladisteId: null, napomena: null })).rejects.toThrow(
      "puno pravo",
    );
    await zavrsiNalog(prisma, SRV, n.id, { ishod: "VRACEN", datum: "2026-02-12", skladisteId: null, napomena: "Popravljeno" });
    expect(await stanje("S-1")).toMatchObject({ stanje: "NA_SKLADISTU", skladisteId: skl.id });
    const z = await prisma.servisniNalog.findUniqueOrThrow({ where: { id: n.id }, include: { dogadaji: { orderBy: { vrijeme: "asc" } } } });
    expect(z).toMatchObject({ status: "VRACEN", dijagnoza: "Pregorio osigurač" });
    expect(z.dogadaji.map((d) => [d.opis, d.javno])).toEqual([
      ["Zaprimljen: Ne pali se", true],
      ["Dijagnoza: Provjeravamo napajanje", true],
      ["Napomena: Mijenja se napajanje", true],
      ["Dijagnoza izmijenjena", false],
      ["Vraćen: Popravljeno", true],
    ]);
    await expect(promijeniStatusServisa(prisma, SRV, n.id, { status: "POPRAVAK", poruka: null, verzija: z.verzija })).rejects.toThrow("zatvoren");
    // novi nalog za isti uređaj nakon zatvaranja je dopušten; druga firma ne vidi nalog
    await prijem(SRV, "S-1", "2026-03-01");
    const druga = await napraviFirmu(prisma);
    const dk = await napraviKorisnika(prisma, druga.id, { uloga: "Voditelj" });
    const D: Akter = { firmaId: druga.id, korisnikId: dk.id, prava: (await pravaClana(prisma, druga.id, dk.id))! };
    await expect(obrisiNalog(prisma, D, n.id)).rejects.toThrow("ne postoji");
    expect(await prisma.dnevnik.count({ where: { firmaId: firma.id, entitet: "ServisniNalog" } })).toBe(5);
    expect(A).toBeDefined();
  });

  it("kupčev uređaj: zamjenski kod kupca, otpis kupčevog odbijen, povrat vraća oba", async () => {
    const { A, skl, kupac, uredaj, stanje, prijem } = await pripremi();
    await uredaj("K-1", { stanje: "PRODAN", partnerId: kupac.id });
    await uredaj("Z-1");
    const n = await prijem(A, "K-1");
    expect(await prisma.servisniNalog.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ partnerId: kupac.id, stanjePrije: "PRODAN" });
    await izdajZamjenu(prisma, A, n.id, { serijski: "Z-1", datum: "2026-02-10" });
    expect(await stanje("Z-1")).toMatchObject({ stanje: "ZAMJENSKI", partnerId: kupac.id, skladisteId: null });
    await uredaj("Z-2");
    await expect(izdajZamjenu(prisma, A, n.id, { serijski: "Z-2", datum: "2026-02-10" })).rejects.toThrow("već ima");
    await expect(zavrsiNalog(prisma, A, n.id, { ishod: "OTPISAN", datum: "2026-02-12", skladisteId: skl.id, napomena: null })).rejects.toThrow(
      "vlasništvo kupca",
    );
    await expect(zavrsiNalog(prisma, A, n.id, { ishod: "VRACEN", datum: "2026-02-12", skladisteId: null, napomena: null })).rejects.toThrow(
      "skladište",
    );
    expect(await stanje("K-1")).toMatchObject({ stanje: "NA_SERVISU" }); // ništa nije promijenjeno
    await zavrsiNalog(prisma, A, n.id, { ishod: "VRACEN", datum: "2026-02-12", skladisteId: skl.id, napomena: null });
    expect(await stanje("K-1")).toMatchObject({ stanje: "PRODAN", partnerId: kupac.id, skladisteId: null });
    expect(await stanje("Z-1")).toMatchObject({ stanje: "NA_SKLADISTU", partnerId: null, skladisteId: skl.id });
  });

  it("zamjenski se vraća i prije završetka; uređaj sa skladišta ne dobiva zamjenski", async () => {
    const { A, skl, kupac, uredaj, stanje, prijem } = await pripremi();
    await uredaj("K-1", { stanje: "PRODAN", partnerId: kupac.id });
    await uredaj("S-1");
    await uredaj("Z-1");
    const n = await prijem(A, "K-1");
    await izdajZamjenu(prisma, A, n.id, { serijski: "Z-1", datum: "2026-02-10" });
    await vratiZamjenu(prisma, A, n.id, { skladisteId: skl.id, datum: "2026-02-11" });
    expect(await stanje("Z-1")).toMatchObject({ stanje: "NA_SKLADISTU" });
    await expect(vratiZamjenu(prisma, A, n.id, { skladisteId: skl.id, datum: "2026-02-11" })).rejects.toThrow("nema zamjenski");
    const s = await prijem(A, "S-1");
    await expect(izdajZamjenu(prisma, A, s.id, { serijski: "Z-1", datum: "2026-02-10" })).rejects.toThrow("samo za uređaj kupca");
  });

  it("brisanje samo tek zaprimljenog naloga bez zamjene; uređaj se vraća", async () => {
    const { A, uredaj, stanje, prijem } = await pripremi();
    await uredaj("S-1");
    const n = await prijem(A, "S-1");
    await obrisiNalog(prisma, A, n.id);
    expect(await stanje("S-1")).toMatchObject({ stanje: "NA_SKLADISTU" });
    expect(await prisma.servisniNalog.count()).toBe(0);
    const m = await prijem(A, "S-1");
    await promijeniStatusServisa(prisma, A, m.id, { status: "POPRAVAK", poruka: null, verzija: 0 });
    await expect(obrisiNalog(prisma, A, m.id)).rejects.toThrow("otkažite");
  });
});

describe("servis i najam — bez dvostruke naplate", () => {
  async function najam() {
    const x = await pripremi();
    await x.uredaj("P-1");
    const r = await spremiUgovor(prisma, x.A, null, {
      partnerId: x.kupac.id,
      poslovnicaId: null,
      od: "2026-01-01",
      do: null,
      rucniBroj: null,
      rokPlacanjaDana: 15,
      nacinPlacanja: "T",
      uvjeti: null,
      napomenaRacuna: null,
      verzija: 0,
    });
    if (!r.ok) throw new Error("ugovor");
    await dodajUredajeNaUgovor(prisma, x.A, r.id, { serijski: ["P-1"], od: "2026-01-01", cijena: 10000, izvor: "SKLADISTE" });
    return { ...x, ugovorId: r.id };
  }
  const osnovica = async (id: string) => (await prisma.prodajniDokument.findUniqueOrThrow({ where: { id } })).osnovica.toFixed(2);

  it("zamjenski za uređaj iz najma je besplatan; povratkom originala najam teče dalje za original", async () => {
    const { A, skl, stanje, prijem, uredaj, ugovorId } = await najam();
    await uredaj("Z-1");
    const n = await prijem(A, "P-1");
    expect(await prisma.servisniNalog.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ ugovorNajmaId: ugovorId, stanjePrije: "U_NAJMU" });
    await izdajZamjenu(prisma, A, n.id, { serijski: "Z-1", datum: "2026-02-10" });
    const r = await izdajRate(prisma, A, ugovorId, "2026-03", new Date("2026-03-01T09:00:00Z"));
    expect(await osnovica(r.id)).toBe("300.00"); // siječanj–ožujak samo za P-1
    await zavrsiNalog(prisma, A, n.id, { ishod: "VRACEN", datum: "2026-03-05", skladisteId: skl.id, napomena: null });
    expect(await stanje("P-1")).toMatchObject({ stanje: "U_NAJMU" });
    expect(await stanje("Z-1")).toMatchObject({ stanje: "NA_SKLADISTU" });
    expect(await prisma.uredajNaUgovoru.count({ where: { ugovorId } })).toBe(1);
  });

  it("otpis originala sa zamjenskim: original do kraja fakturiranog (31.3.), zamjenski od 1.4. po istoj cijeni", async () => {
    const { A, stanje, prijem, uredaj, ugovorId, firma } = await najam();
    await uredaj("Z-1");
    const n = await prijem(A, "P-1");
    await izdajZamjenu(prisma, A, n.id, { serijski: "Z-1", datum: "2026-02-10" });
    await izdajRate(prisma, A, ugovorId, "2026-03", new Date("2026-03-01T09:00:00Z"));
    await zavrsiNalog(prisma, A, n.id, { ishod: "OTPISAN", datum: "2026-02-20", skladisteId: null, napomena: "Neisplativo" });
    expect(await stanje("P-1")).toMatchObject({ stanje: "OTPISAN", partnerId: null });
    expect(await stanje("Z-1")).toMatchObject({ stanje: "U_NAJMU" });
    const planovi = await prisma.uredajNaUgovoru.findMany({
      where: { ugovorId },
      include: { uredaj: { select: { serijski: true } }, cijene: true },
      orderBy: { stvoreno: "asc" },
    });
    expect(planovi.map((p) => [p.uredaj.serijski, p.od.toISOString().slice(0, 10), p.do?.toISOString().slice(0, 10) ?? null])).toEqual([
      ["P-1", "2026-01-01", "2026-03-31"],
      ["Z-1", "2026-04-01", null],
    ]);
    expect(planovi[1]!.cijene.map((c) => [c.od.toISOString().slice(0, 7), c.iznos.toFixed(2)])).toEqual([["2026-04", "100.00"]]);
    const r = await izdajRate(prisma, A, ugovorId, "2026-04", new Date("2026-04-01T09:00:00Z"));
    expect(await osnovica(r.id)).toBe("100.00"); // travanj samo za Z-1
    expect(await provjeriDosljednost(prisma, firma.id)).toEqual([]);
  });

  it("otpis originala bez zamjenskog: naplata do datuma otpisa, višak za odobrenje", async () => {
    const { A, stanje, prijem, ugovorId } = await najam();
    const n = await prijem(A, "P-1");
    await izdajRate(prisma, A, ugovorId, "2026-02", new Date("2026-02-05T09:00:00Z"));
    const r = await zavrsiNalog(prisma, A, n.id, { ishod: "OTPISAN", datum: "2026-02-10", skladisteId: null, napomena: null });
    expect(r.visak).toBe(6429); // veljača: 10/28 × 100,00 = 35,71 → višak 64,29
    expect(await stanje("P-1")).toMatchObject({ stanje: "OTPISAN" });
    await expect(izdajRate(prisma, A, ugovorId, "2026-06", new Date("2026-06-01T09:00:00Z"))).rejects.toThrow("Nema rata");
  });

  it("najam završen dok je uređaj na servisu: povratak na skladište, zamjenski se vraća (nikad ostane „zamjenski“)", async () => {
    const { A, skl, stanje, prijem, uredaj, ugovorId } = await najam();
    await uredaj("Z-1");
    const n = await prijem(A, "P-1");
    await izdajZamjenu(prisma, A, n.id, { serijski: "Z-1", datum: "2026-02-10" });
    const plan = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId } });
    await vratiUredaj(prisma, A, ugovorId, plan.id, "2026-02-12", skl.id);
    expect(await stanje("P-1")).toMatchObject({ stanje: "NA_SERVISU" });
    // otpis sa zamjenskim bez aktivnog plana: najam se ne prenosi, zamjenski na skladište
    await expect(zavrsiNalog(prisma, A, n.id, { ishod: "OTPISAN", datum: "2026-02-20", skladisteId: null, napomena: null })).rejects.toThrow(
      "skladište",
    );
    await zavrsiNalog(prisma, A, n.id, { ishod: "OTPISAN", datum: "2026-02-20", skladisteId: skl.id, napomena: null });
    expect(await stanje("P-1")).toMatchObject({ stanje: "OTPISAN" });
    expect(await stanje("Z-1")).toMatchObject({ stanje: "NA_SKLADISTU", partnerId: null });
    expect(await prisma.uredajNaUgovoru.count({ where: { ugovorId } })).toBe(1);
  });

  it("povrat s servisa uređaja čiji je najam završio: na skladište, ne „u najmu“ bez ugovora", async () => {
    const { A, skl, stanje, prijem, ugovorId } = await najam();
    const n = await prijem(A, "P-1");
    const plan = await prisma.uredajNaUgovoru.findFirstOrThrow({ where: { ugovorId } });
    await vratiUredaj(prisma, A, ugovorId, plan.id, "2026-02-12", skl.id);
    await expect(zavrsiNalog(prisma, A, n.id, { ishod: "VRACEN", datum: "2026-02-20", skladisteId: null, napomena: null })).rejects.toThrow(
      "nije na ugovoru",
    );
    await zavrsiNalog(prisma, A, n.id, { ishod: "VRACEN", datum: "2026-02-20", skladisteId: skl.id, napomena: null });
    expect(await stanje("P-1")).toMatchObject({ stanje: "NA_SKLADISTU", partnerId: null, skladisteId: skl.id });
  });

  it("uređaj na servisu bez naloga je nalaz provjere dosljednosti", async () => {
    const { uredaj, firma } = await pripremi();
    const u = await uredaj("X-1");
    await prisma.uredaj.update({ where: { id: u.id }, data: { stanje: "NA_SERVISU", stanjePrijeServisa: "NA_SKLADISTU" } });
    expect((await provjeriDosljednost(prisma, firma.id)).map((x) => x.vrsta)).toEqual(["SERVIS_BEZ_NALOGA"]);
  });
});
