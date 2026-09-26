import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { spremiNarudzbenicu, zaprimiPoNarudzbenici } from "./nabava";
import { zaprimi } from "./primke";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { kategorijeTroskova, obrisiTrosak, oznaciPlaceno, pregledTroskova, spremiPonavljajuci, spremiTrosak, stvoriPonavljajuce } from "./troskovi";
import { spremiUlazniRacun } from "./ulazni-racuni";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-03-20T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const akter = async (uloga: string) => {
    const k = await napraviKorisnika(prisma, firma.id, { uloga });
    return { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! } satisfies Akter;
  };
  const A = await akter("Administrator");
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const dob = await prisma.partner.create({
    data: { firmaId: firma.id, naziv: "Dobavljač d.o.o.", oib: "94577403194", kupac: false, dobavljac: true },
  });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const m = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "Latitude", proizvodjacId: p.id, kategorijaId: kat.id } });
  const kategorije = await kategorijeTroskova(prisma, firma.id);
  const katId = (n: string) => kategorije.find((k) => k.naziv === n)!.id;
  return { firma, A, akter, skl, dob, m, katId };
}

describe("troškovi", () => {
  it("ručni trošak: plaćeno u oba smjera, brisanje; zadane kategorije", async () => {
    const { A, katId, firma } = await pripremi();
    const r = await spremiTrosak(prisma, A, null, {
      datum: "2026-03-01",
      kategorijaId: katId("Režije"),
      opis: "Struja",
      iznos: 12000,
      pdv: 1560,
      placeno: false,
    });
    if (!r.ok) throw new Error();
    await oznaciPlaceno(prisma, A, r.id, true, "2026-03-05");
    expect(await prisma.trosak.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({
      placeno: true,
      datumPlacanja: new Date("2026-03-05T00:00:00Z"),
    });
    await oznaciPlaceno(prisma, A, r.id, false);
    expect(await prisma.trosak.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ placeno: false, datumPlacanja: null });
    expect(
      await spremiTrosak(prisma, A, null, { datum: "2026-03-01", kategorijaId: katId("Režije"), opis: "", iznos: 0, pdv: 0, placeno: false }),
    ).toMatchObject({ ok: false });
    await obrisiTrosak(prisma, A, r.id);
    expect(await prisma.trosak.count({ where: { firmaId: firma.id } })).toBe(0);
  });

  it("ponavljajući: stvara dospjele mjesece jednom (i istovremeno)", async () => {
    const { A, katId, firma } = await pripremi();
    await spremiPonavljajuci(prisma, A, {
      kategorijaId: katId("Najam prostora"),
      opis: "Najam ureda",
      iznos: 80000,
      pdv: 20000,
      dan: 5,
      od: "2026-01",
      do: null,
    });
    await Promise.all([stvoriPonavljajuce(prisma, firma.id, SADA), stvoriPonavljajuce(prisma, firma.id, SADA)]);
    const t = await prisma.trosak.findMany({ where: { firmaId: firma.id }, orderBy: { datum: "asc" } });
    expect(t.map((x) => x.datum.toISOString().slice(0, 10))).toEqual(["2026-01-05", "2026-02-05", "2026-03-05"]);
    expect(await stvoriPonavljajuce(prisma, firma.id, SADA)).toBe(0);
    expect(await stvoriPonavljajuce(prisma, firma.id, new Date("2026-04-05T08:00:00Z"))).toBe(1);
  });

  it("pregled: ulazni računi, trošak robe po narudžbenici, primke u troškovima — roba skrivena bez prava nabavnih cijena", async () => {
    const { A, akter, skl, dob, m, katId, firma } = await pripremi();
    const n = await spremiNarudzbenicu(prisma, A, null, {
      datum: "2026-03-02",
      dobavljacId: dob.id,
      napomena: null,
      verzija: 0,
      stavke: [{ modelId: m.id, kolicina: 1, cijena: 100000 }],
    });
    const st = await prisma.stavkaNarudzbenice.findFirstOrThrow({ where: { narudzbenicaId: n.id } });
    await zaprimiPoNarudzbenici(
      prisma,
      A,
      n.id,
      { datum: "2026-03-03", skladisteId: skl.id, dokumentDobavljaca: null, knjiziUTroskove: true, stavke: [{ stavkaId: st.id, serijski: ["T-1"] }] },
      SADA,
    );
    const racun = (x: object) =>
      spremiUlazniRacun(prisma, A, null, {
        broj: "R",
        datum: "2026-03-04",
        dospijece: null,
        dobavljacId: dob.id,
        dobavljacTekst: null,
        dobavljacOib: null,
        narudzbenicaId: n.id,
        primkaId: null,
        zaRobu: true,
        osnovica: 120000,
        pdv: 30000,
        opis: null,
        verzija: 0,
        ...x,
      });
    await racun({});
    await racun({ broj: "PRIJ", zaRobu: false, osnovica: 5000, pdv: 1250 });
    await zaprimi(
      prisma,
      A,
      {
        datum: "2026-03-06",
        skladisteId: skl.id,
        dobavljacId: null,
        stanjeRobeId: null,
        dokumentDobavljaca: null,
        napomena: null,
        knjiziUTroskove: true,
        stavke: [{ serijski: "T-2", modelId: m.id, nabavnaCijena: 30000 }],
      },
      SADA,
    );
    await spremiTrosak(prisma, A, null, { datum: "2026-03-10", kategorijaId: katId("Režije"), opis: "Voda", iznos: 2000, pdv: 0, placeno: true });

    const sve = await pregledTroskova(prisma, firma.id, A.prava, "2026-03-01", "2026-03-31");
    expect(sve.map((r) => [r.izvor, r.kategorija, r.iznos]).sort()).toEqual(
      [
        ["NARUDZBENICA", "Roba", 120000],
        ["PRIMKA", "Roba", 30000],
        ["RUCNI", "Režije", 2000],
        ["ULAZNI", "Usluge", 5000],
      ].sort(),
    );
    const knjigovodja = await akter("Voditelj");
    await prisma.clanstvoFirme.updateMany({ where: { korisnikId: knjigovodja.korisnikId }, data: { iznimke: { posebna: { costs: false } } } });
    const bez = await pravaClana(prisma, firma.id, knjigovodja.korisnikId);
    const vidi = await pregledTroskova(prisma, firma.id, bez!, "2026-03-01", "2026-03-31");
    expect(vidi.map((r) => r.izvor).sort()).toEqual(["RUCNI", "ULAZNI"]);
  });
});
