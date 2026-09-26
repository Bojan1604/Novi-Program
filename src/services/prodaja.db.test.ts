import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { UlaznaStavka } from "@/domain/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { izdajPonudu, obrisiNacrt, pretvori, spremiNacrt, type UlazDokumenta } from "./prodaja";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Prodavač", ime: "Petra" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const model = await prisma.modelUredaja.create({
    data: { firmaId: firma.id, naziv: "Latitude", proizvodjacId: p.id, kategorijaId: kat.id, preporucenaCijena: "1000.00" },
  });
  const usluga = await prisma.usluga.create({ data: { firmaId: firma.id, naziv: "Instalacija", jedinica: "h", cijena: "40.00" } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o.", oib: "69435151530", rokPlacanjaDana: 30 } });
  const euKupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Muster GmbH", drzava: "DE", pdvBroj: "DE123456789" } });
  const stavke: UlaznaStavka[] = [
    {
      vrsta: "MODEL",
      namjena: "PRODAJA",
      modelId: model.id,
      naziv: "Dell Latitude",
      jedinica: "kom",
      kolicina: 2000,
      cijena: 100000,
      popust: 1000,
      stopa: 2500,
    },
    {
      vrsta: "USLUGA",
      namjena: "PRODAJA",
      uslugaId: usluga.id,
      naziv: "Instalacija",
      jedinica: "h",
      kolicina: 1500,
      cijena: 4000,
      popust: 0,
      stopa: 2500,
    },
  ];
  const ulaz = (x: Partial<UlazDokumenta> = {}): UlazDokumenta => ({
    vrsta: "PONUDA",
    verzija: 0,
    partnerId: kupac.id,
    poslovnicaId: null,
    datum: "2026-09-25",
    vrijediDo: "2026-10-10",
    dospijece: null,
    popust: 0,
    napomena: null,
    stavke,
    ...x,
  });
  return { firma, A, kupac, euKupac, ulaz, model };
}

describe("ponuda i predračun", () => {
  it("nacrt: zbrojevi na poslužitelju; izdavanje s brojem i snimkom; izdana se ne mijenja", async () => {
    const { A, ulaz, firma } = await pripremi();
    const n = await spremiNacrt(prisma, A, null, ulaz());
    const dok = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id }, include: { stavke: { orderBy: { redoslijed: "asc" } } } });
    // 2 × 1.000 − 10 % = 1.800,00 + 1,5 h × 40 = 60,00 → 1.860,00; PDV 465,00
    expect([dok.osnovica.toFixed(2), dok.pdv.toFixed(2), dok.ukupno.toFixed(2)]).toEqual(["1860.00", "465.00", "2325.00"]);
    expect(dok.stavke.map((s) => [s.iznos.toFixed(2), s.kategorija, s.vrstaIsporuke])).toEqual([
      ["1800.00", "HR", "ROBA"],
      ["60.00", "HR", "USLUGA"],
    ]);
    const { broj } = await izdajPonudu(prisma, A, n.id, SADA);
    expect(broj).toBe("PON-1/2026");
    const izd = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id } });
    expect(izd.status).toBe("IZDAN");
    expect((izd.snimka as { firma: { naziv: string } }).firma.naziv).toBe(firma.naziv);
    await expect(spremiNacrt(prisma, A, n.id, ulaz({ verzija: izd.verzija }))).rejects.toThrow("Izdani dokument se ne može mijenjati.");
    await expect(izdajPonudu(prisma, A, n.id, SADA)).rejects.toThrow("već izdan");
    await expect(obrisiNacrt(prisma, A, n.id)).rejects.toThrow("ne može obrisati");
    // promjena postavki firme ne mijenja izdani dokument
    await prisma.firma.update({ where: { id: firma.id }, data: { naziv: "Novi naziv d.o.o." } });
    expect(((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id } })).snimka as { firma: { naziv: string } }).firma.naziv).toBe(
      firma.naziv,
    );
  });

  it("verzija nacrta štiti od istovremenih izmjena; EU kupac bez PDV-a", async () => {
    const { A, ulaz, euKupac } = await pripremi();
    const n = await spremiNacrt(prisma, A, null, ulaz());
    const v2 = await spremiNacrt(prisma, A, n.id, ulaz({ verzija: n.verzija, partnerId: euKupac.id }));
    await expect(spremiNacrt(prisma, A, n.id, ulaz({ verzija: n.verzija }))).rejects.toThrow("Netko je u međuvremenu");
    const dok = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id }, include: { stavke: { orderBy: { redoslijed: "asc" } } } });
    expect(dok.verzija).toBe(v2.verzija);
    expect(dok.pdv.toFixed(2)).toBe("0.00");
    expect(dok.stavke.map((s) => s.kategorija)).toEqual(["EU_ROBA", "EU_USLUGA"]);
  });

  it("provjere: kupac, datumi, stavke, tuđi model", async () => {
    const { A, ulaz, firma } = await pripremi();
    await expect(spremiNacrt(prisma, A, null, ulaz({ vrijediDo: "2026-09-01" }))).rejects.toThrow("Vrijedi do ne smije biti prije");
    await expect(spremiNacrt(prisma, A, null, ulaz({ popust: 10001 }))).rejects.toThrow("Popust dokumenta");
    await expect(spremiNacrt(prisma, A, null, ulaz({ stavke: [{ ...ulaz().stavke[0]!, kolicina: 0 }] }))).rejects.toThrow("Stavka 1: količina");
    const dob = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Samo dobavljač", kupac: false, dobavljac: true } });
    await expect(spremiNacrt(prisma, A, null, ulaz({ partnerId: dob.id }))).rejects.toThrow("aktivnog kupca");
    const druga = await napraviFirmu(prisma, "Druga");
    const tp = await prisma.proizvodjac.create({ data: { firmaId: druga.id, naziv: "X" } });
    const tk = await prisma.kategorija.create({ data: { firmaId: druga.id, naziv: "K" } });
    const tm = await prisma.modelUredaja.create({ data: { firmaId: druga.id, naziv: "Tuđi", proizvodjacId: tp.id, kategorijaId: tk.id } });
    await expect(spremiNacrt(prisma, A, null, ulaz({ stavke: [{ ...ulaz().stavke[0]!, modelId: tm.id }] }))).rejects.toThrow("ne postoje");
    const bezKupca = await spremiNacrt(prisma, A, null, ulaz({ partnerId: null }));
    await expect(izdajPonudu(prisma, A, bezKupca.id, SADA)).rejects.toThrow("Odaberite kupca");
  });

  it("pretvaranje ponuda → predračun → račun prenosi sve bez gubitka; ponovljeno ne stvara duplikat", async () => {
    const { A, ulaz } = await pripremi();
    const n = await spremiNacrt(prisma, A, null, ulaz({ popust: 500, napomena: "Isporuka u roku 3 dana" }));
    await izdajPonudu(prisma, A, n.id, SADA);
    const pred = await pretvori(prisma, A, n.id, "PREDRACUN", SADA);
    expect((await pretvori(prisma, A, n.id, "PREDRACUN", SADA)).id).toBe(pred.id);
    await izdajPonudu(prisma, A, pred.id, SADA);
    const rac = await pretvori(prisma, A, pred.id, "RACUN", SADA);
    const [a, b, c] = await Promise.all(
      [n.id, pred.id, rac.id].map((id) =>
        prisma.prodajniDokument.findUniqueOrThrow({ where: { id }, include: { stavke: { orderBy: { redoslijed: "asc" } } } }),
      ),
    );
    const bit = (x: NonNullable<typeof a>) => ({
      zbroj: [x.osnovica.toFixed(2), x.pdv.toFixed(2), x.ukupno.toFixed(2)],
      popust: x.popust,
      napomena: x.napomena,
      stavke: x.stavke.map(({ id: _i, dokumentId: _d, ...s }) => ({ ...s, cijena: s.cijena.toFixed(2), iznos: s.iznos.toFixed(2) })),
    });
    expect(bit(b!)).toEqual(bit(a!));
    expect(bit(c!)).toEqual(bit(a!));
    expect(c!).toMatchObject({ vrsta: "RACUN", status: "NACRT", izvorId: pred.id });
    expect(c!.dospijece?.toISOString().slice(0, 10)).toBe("2026-10-25");
    await expect(pretvori(prisma, A, rac.id, "PONUDA", SADA)).rejects.toThrow("ne može pretvoriti");
  });
});
