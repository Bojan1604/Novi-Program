import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { spremiNarudzbenicu, zaprimiPoNarudzbenici } from "./nabava";
import { dodajPriloge } from "./prilozi";
import { stornirajPrimku } from "./primke";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { spremiUlazniRacun, stornirajUlazniRacun, trosakPoNarudzbenici, type UlazUlaznogRacuna } from "./ulazni-racuni";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const dob = await prisma.partner.create({
    data: { firmaId: firma.id, naziv: "Dobavljač d.o.o.", oib: "69435151530", kupac: false, dobavljac: true },
  });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const m = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "Latitude", proizvodjacId: p.id, kategorijaId: kat.id } });
  const n = await spremiNarudzbenicu(prisma, A, null, {
    datum: "2026-09-20",
    dobavljacId: dob.id,
    napomena: null,
    verzija: 0,
    stavke: [{ modelId: m.id, kolicina: 2, cijena: 50000 }],
  });
  const st = await prisma.stavkaNarudzbenice.findFirstOrThrow({ where: { narudzbenicaId: n.id } });
  const ulaz = (x: Partial<UlazUlaznogRacuna> = {}): UlazUlaznogRacuna => ({
    broj: "R-100",
    datum: "2026-09-24",
    dospijece: "2026-10-24",
    dobavljacId: dob.id,
    dobavljacTekst: null,
    dobavljacOib: null,
    narudzbenicaId: n.id,
    primkaId: null,
    zaRobu: true,
    osnovica: 110000,
    pdv: 27500,
    opis: null,
    verzija: 0,
    ...x,
  });
  const novi = async (x: Partial<UlazUlaznogRacuna> = {}) => {
    const r = await spremiUlazniRacun(prisma, A, null, ulaz(x));
    if (!r.ok) throw new Error(JSON.stringify(r.polja));
    return r.id;
  };
  return { firma, A, skl, dob, n, st, ulaz, novi };
}

describe("ulazni računi", () => {
  it("trošak robe po narudžbenici kroz primku, račun za robu, prijevoz, storno", async () => {
    const { A, skl, n, st, novi, firma } = await pripremi();
    const primka = await zaprimiPoNarudzbenici(
      prisma,
      A,
      n.id,
      {
        datum: "2026-09-25",
        skladisteId: skl.id,
        dokumentDobavljaca: null,
        knjiziUTroskove: true,
        stavke: [{ stavkaId: st.id, serijski: ["U-1", "U-2"] }],
      },
      SADA,
    );
    expect(await trosakPoNarudzbenici(prisma, firma.id, n.id)).toMatchObject({ primke: 100000, racuniRobe: 0, roba: 100000, zasebno: 0 });
    const r1 = await novi();
    expect(await trosakPoNarudzbenici(prisma, firma.id, n.id)).toMatchObject({ roba: 110000, izvor: "RACUNI" });
    await novi({ broj: "PRIJ-1", zaRobu: false, osnovica: 5000, pdv: 1250 });
    expect(await trosakPoNarudzbenici(prisma, firma.id, n.id)).toMatchObject({ roba: 110000, zasebno: 5000, ukupno: 115000 });
    await stornirajUlazniRacun(prisma, A, r1, "krivi iznos");
    expect(await trosakPoNarudzbenici(prisma, firma.id, n.id)).toMatchObject({ roba: 100000, izvor: "PRIMKE" });
    await stornirajPrimku(prisma, A, primka.id);
    expect(await trosakPoNarudzbenici(prisma, firma.id, n.id)).toMatchObject({ roba: 0, zasebno: 5000 });
  });

  it("oznaka „račun za robu“ se ne gubi pri izmjeni, a mijenja se samo namjerno; dnevnik", async () => {
    const { A, ulaz, novi, firma } = await pripremi();
    const id = await novi();
    await spremiUlazniRacun(prisma, A, id, ulaz({ opis: "izmjena", verzija: 0 }));
    expect((await prisma.ulazniRacun.findUniqueOrThrow({ where: { id } })).zaRobu).toBe(true);
    await spremiUlazniRacun(prisma, A, id, ulaz({ zaRobu: false, verzija: 1 }));
    expect((await prisma.ulazniRacun.findUniqueOrThrow({ where: { id } })).zaRobu).toBe(false);
    await expect(spremiUlazniRacun(prisma, A, id, ulaz({ verzija: 1 }))).rejects.toThrow("u međuvremenu");
    const dn = await prisma.dnevnik.findMany({ where: { firmaId: firma.id, entitetId: id }, orderBy: { vrijeme: "asc" } });
    expect(dn.map((x) => x.opis).at(-1)).toContain("račun za robu: ne");
  });

  it("dobavljač slobodnim tekstom s OIB-om; provjere; prilog; interni broj URA", async () => {
    const { A, ulaz } = await pripremi();
    const r = await spremiUlazniRacun(
      prisma,
      A,
      null,
      ulaz({ dobavljacId: null, dobavljacTekst: "Obrt Ivić", dobavljacOib: "HR94577403194", narudzbenicaId: null, zaRobu: false }),
    );
    expect(r.ok).toBe(true);
    const u = await prisma.ulazniRacun.findUniqueOrThrow({ where: { id: (r as { id: string }).id } });
    expect([u.interni, u.dobavljacTekst, u.dobavljacOib, u.ukupno.toFixed(2)]).toEqual(["URA-1/2026", "Obrt Ivić", "94577403194", "1375.00"]);
    expect(await spremiUlazniRacun(prisma, A, null, ulaz({ dobavljacId: null, dobavljacTekst: null }))).toMatchObject({
      ok: false,
      polja: { dobavljac: expect.any(String) },
    });
    expect(await spremiUlazniRacun(prisma, A, null, ulaz({ dospijece: "2026-01-01" }))).toMatchObject({
      ok: false,
      polja: { dospijece: expect.any(String) },
    });
    expect(
      await dodajPriloge(prisma, A, "UlazniRacun", u.id, [{ naziv: "racun.pdf", velicina: 8, sadrzaj: new TextEncoder().encode("%PDF-1.4") }]),
    ).toBe(1);
  });

  it("narudžbenica drugog dobavljača se odbija", async () => {
    const { A, ulaz, firma } = await pripremi();
    const drugi = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Drugi", kupac: false, dobavljac: true } });
    expect(await spremiUlazniRacun(prisma, A, null, ulaz({ dobavljacId: drugi.id }))).toMatchObject({
      ok: false,
      polja: { narudzbenicaId: expect.stringContaining("drugog dobavljača") },
    });
  });
});
