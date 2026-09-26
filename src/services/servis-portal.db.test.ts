import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { danas } from "@/domain/datum";
import { pdfNaloga, podaciNalogaPdf } from "@/lib/servis-pdf";
import { nalogKlijenta, prilogKlijenta, uredajiZaPrijavu } from "@/queries/portal";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { dodajPriloge } from "./prilozi";
import { postaviJavnostPriloga, prijaviKvarPortal, spremiDijagnozu, zaprimiNaServis, zaprimiPrijavu, zavrsiNalog } from "./servis";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const DAN = danas();
const slika = (naziv = "kvar.jpg", velicina = 1000) => ({ naziv, velicina, sadrzaj: new Uint8Array(velicina) });

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const v = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: v.id, prava: (await pravaClana(prisma, firma.id, v.id))! };
  const [pa, pb] = await Promise.all(["Klijent A", "Klijent B"].map((naziv) => prisma.partner.create({ data: { firmaId: firma.id, naziv } })));
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "HP" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const m = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "ProBook", proizvodjacId: p.id, kategorijaId: kat.id } });
  const ua = await prisma.uredaj.create({ data: { firmaId: firma.id, serijski: "A-1", modelId: m.id, stanje: "PRODAN", partnerId: pa!.id } });
  const ub = await prisma.uredaj.create({ data: { firmaId: firma.id, serijski: "B-1", modelId: m.id, stanje: "PRODAN", partnerId: pb!.id } });
  const ka = { firmaId: firma.id, partnerId: pa!.id, ip: "10.0.0.5", ime: "Ivana" };
  const kb = { firmaId: firma.id, partnerId: pb!.id, ip: "10.0.0.6", ime: "Marko" };
  return { firma, A, ua, ub, ka, kb };
}

describe("portal: prijava kvara i praćenje", () => {
  it("prijava do 4 fotografije; uređaj ostaje kod klijenta dok ga servis ne zaprimi", async () => {
    const { A, ua, ub, ka } = await pripremi();
    await expect(
      prijaviKvarPortal(prisma, ka, { uredajId: ua.id, opisKvara: "Ekran treperi", kontakt: null }, Array(5).fill(slika())),
    ).rejects.toThrow("Najviše 4");
    await expect(prijaviKvarPortal(prisma, ka, { uredajId: ua.id, opisKvara: "Ekran treperi", kontakt: null }, [slika("racun.pdf")])).rejects.toThrow(
      "nije fotografija",
    );
    await expect(prijaviKvarPortal(prisma, ka, { uredajId: ub.id, opisKvara: "Tuđi uređaj", kontakt: null }, [])).rejects.toThrow("ne postoji");
    const n = await prijaviKvarPortal(prisma, ka, { uredajId: ua.id, opisKvara: "Ekran treperi", kontakt: "091 111" }, [
      slika("a.jpg"),
      slika("b.png"),
    ]);
    expect(await prisma.servisniNalog.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({
      status: "PRIJAVLJEN",
      izvor: "PORTAL",
      korisnikId: null,
    });
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: ua.id } })).stanje).toBe("PRODAN");
    expect(await prisma.prilog.count({ where: { entitetId: n.id, javno: true } })).toBe(2);
    await expect(prijaviKvarPortal(prisma, ka, { uredajId: ua.id, opisKvara: "Opet", kontakt: null }, [])).rejects.toThrow(
      "već postoji otvoren nalog",
    );
    expect(await uredajiZaPrijavu(prisma, ka)).toEqual([]);
    await expect(zaprimiNaServis(prisma, A, { serijski: "A-1", opisKvara: "Duplo", datum: DAN, skladisteId: null, kontakt: null })).rejects.toThrow(
      "prijava kvara",
    );
    await zaprimiPrijavu(prisma, A, n.id, { datum: DAN, skladisteId: null });
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: ua.id } })).stanje).toBe("NA_SERVISU");
    expect(await prisma.servisniNalog.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ status: "ZAPRIMLJEN", stanjePrije: "PRODAN" });
  });

  it("otkaz prijave prije zaprimanja ne dira uređaj", async () => {
    const { A, ua, ka } = await pripremi();
    const n = await prijaviKvarPortal(prisma, ka, { uredajId: ua.id, opisKvara: "Ne pali se", kontakt: null }, []);
    await expect(zavrsiNalog(prisma, A, n.id, { ishod: "VRACEN", datum: DAN, skladisteId: null, napomena: null })).rejects.toThrow("samo otkazati");
    await zavrsiNalog(prisma, A, n.id, { ishod: "OTKAZAN", datum: DAN, skladisteId: null, napomena: "Riješeno telefonom" });
    expect((await prisma.uredaj.findUniqueOrThrow({ where: { id: ua.id } })).stanje).toBe("PRODAN");
  });

  it("interni prilog, dijagnoza i interni događaji nikad ne idu klijentu; tuđi nalog i prilog ne postoje", async () => {
    const { A, ua, ka, kb } = await pripremi();
    const n = await prijaviKvarPortal(prisma, ka, { uredajId: ua.id, opisKvara: "Ekran treperi", kontakt: null }, [slika("a.jpg")]);
    await zaprimiPrijavu(prisma, A, n.id, { datum: DAN, skladisteId: null });
    await spremiDijagnozu(prisma, A, n.id, { dijagnoza: "TAJNO: kupac ga je polio kavom", napomenaKlijentu: "Mijenja se matična", verzija: 1 });
    await dodajPriloge(prisma, A, "ServisniNalog", n.id, [{ naziv: "interni-nalaz.pdf", velicina: 10, sadrzaj: new Uint8Array(10) }]);
    const interni = await prisma.prilog.findFirstOrThrow({ where: { entitetId: n.id, naziv: "interni-nalaz.pdf" } });
    expect(interni.javno).toBe(false);

    const v = await nalogKlijenta(prisma, ka, n.id);
    expect(v).not.toBeNull();
    expect(JSON.stringify(v)).not.toContain("TAJNO");
    expect(Object.keys(v!)).not.toContain("dijagnoza");
    expect(v!.prilozi.map((p) => p.naziv)).toEqual(["a.jpg"]);
    expect(v!.dogadaji.map((d) => d.opis)).not.toContain("Dijagnoza izmijenjena");
    expect(v!.napomenaKlijentu).toBe("Mijenja se matična");
    expect(await prilogKlijenta(prisma, ka, interni.id)).toBeNull();

    // tuđi klijent: ni nalog ni javni prilog
    const javni = await prisma.prilog.findFirstOrThrow({ where: { entitetId: n.id, naziv: "a.jpg" } });
    expect(await nalogKlijenta(prisma, kb, n.id)).toBeNull();
    expect(await prilogKlijenta(prisma, kb, javni.id)).toBeNull();
    expect(await podaciNalogaPdf(prisma, kb.firmaId, n.id, kb.partnerId)).toBeNull();

    // serviser može prilog učiniti javnim (npr. zapisnik) i opet internim
    await postaviJavnostPriloga(prisma, A, n.id, interni.id, true);
    expect(await prilogKlijenta(prisma, ka, interni.id)).not.toBeNull();
    await postaviJavnostPriloga(prisma, A, n.id, interni.id, false);
    expect(await prilogKlijenta(prisma, ka, interni.id)).toBeNull();

    // otpremnica: samo javni podaci
    const d = (await podaciNalogaPdf(prisma, ka.firmaId, n.id, ka.partnerId))!;
    expect(JSON.stringify(d)).not.toContain("TAJNO");
    expect((await pdfNaloga(d)).subarray(0, 4).toString()).toBe("%PDF");
  });
});
