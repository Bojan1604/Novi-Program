import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { popisZaKnjigovodju } from "./knjigovodja";
import { pravaClana, type Akter } from "./korisnici";
import { spremiNarudzbenicu, zaprimiPoNarudzbenici, zatvoriNarudzbenicu } from "./nabava";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { pregledTroskova } from "./troskovi";
import { platiUlazni, ponistiPlacanjeUlaznog, spremiUlazniRacun, stornirajUlazniRacun, type UlazUlaznogRacuna } from "./ulazni-racuni";

/** Regresije iz pregleda faze 4. */
const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const v = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: v.id, prava: (await pravaClana(prisma, firma.id, v.id))! };
  const s = await napraviKorisnika(prisma, firma.id, { uloga: "Skladištar" });
  const S: Akter = { firmaId: firma.id, korisnikId: s.id, prava: (await pravaClana(prisma, firma.id, s.id))! };
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
    dospijece: null,
    dobavljacId: dob.id,
    dobavljacTekst: null,
    dobavljacOib: null,
    narudzbenicaId: null,
    primkaId: null,
    zaRobu: true,
    osnovica: 100000,
    pdv: 25000,
    opis: null,
    verzija: 0,
    ...x,
  });
  const novi = async (x: Partial<UlazUlaznogRacuna> = {}) => {
    const r = await spremiUlazniRacun(prisma, A, null, ulaz(x));
    if (!r.ok) throw new Error(JSON.stringify(r.polja));
    return r.id;
  };
  const zaprimi = (akter: Akter, stavke: { stavkaId: string; serijski: string[] }[]) =>
    zaprimiPoNarudzbenici(
      prisma,
      akter,
      n.id,
      { datum: "2026-09-25", skladisteId: skl.id, dokumentDobavljaca: null, knjiziUTroskove: false, stavke },
      SADA,
    );
  return { firma, A, S, n, st, ulaz, novi, zaprimi };
}

describe("ispravci nabave i ulaznih računa", () => {
  it("ista stavka dvaput u zahtjevu ne zaobilazi naručenu količinu", async () => {
    const { A, st, zaprimi } = await pripremi();
    await expect(
      zaprimi(A, [
        { stavkaId: st.id, serijski: ["D-1", "D-2", "D-3"] },
        { stavkaId: st.id, serijski: ["D-4"] },
      ]),
    ).rejects.toThrow("dvaput");
  });

  it("skladištar bez prava „costs“ zaprima po narudžbenici s nabavnom cijenom sa stavke", async () => {
    const { S, st, zaprimi, firma } = await pripremi();
    const p = await zaprimi(S, [{ stavkaId: st.id, serijski: ["S-1"] }]);
    expect((await prisma.primka.findUniqueOrThrow({ where: { id: p.id } })).nabavnaVrijednost?.toFixed(2)).toBe("500.00");
    expect((await prisma.uredaj.findFirstOrThrow({ where: { firmaId: firma.id, serijski: "S-1" } })).nabavnaCijena?.toFixed(2)).toBe("500.00");
  });

  it("račun vezan na primku po narudžbenici ide na narudžbenicu (roba se ne broji dvaput); storno narudžbenice s računom odbijen", async () => {
    const { A, st, zaprimi, novi, n, firma } = await pripremi();
    const p = await zaprimi(A, [{ stavkaId: st.id, serijski: ["P-1", "P-2"] }]);
    const r = await novi({ primkaId: p.id });
    expect((await prisma.ulazniRacun.findUniqueOrThrow({ where: { id: r } })).narudzbenicaId).toBe(n.id);
    const t = await pregledTroskova(prisma, firma.id, A.prava, "2026-09-01", "2026-09-30");
    expect(t.map((x) => [x.izvor, x.iznos])).toEqual([["NARUDZBENICA", 100000]]);

    const n2 = await spremiNarudzbenicu(prisma, A, null, {
      datum: "2026-09-21",
      dobavljacId: (await prisma.partner.findFirstOrThrow({ where: { firmaId: firma.id, dobavljac: true } })).id,
      napomena: null,
      verzija: 0,
      stavke: [{ modelId: st.modelId, kolicina: 1, cijena: 100 }],
    });
    await novi({ broj: "R-2", narudzbenicaId: n2.id });
    await expect(zatvoriNarudzbenicu(prisma, A, n2.id, "STORNO")).rejects.toThrow("ulazni računi");
  });

  it("odobrenje dobavljača (negativno) se sprema; izmjena ispod plaćenog odbijena; plaćanje se poništava", async () => {
    const { A, ulaz, novi } = await pripremi();
    const o = await spremiUlazniRacun(prisma, A, null, ulaz({ broj: "OD-1", osnovica: -10000, pdv: -2500, zaRobu: false }));
    expect(o.ok).toBe(true);
    const r = await novi({ zaRobu: false });
    await platiUlazni(prisma, A, r, { datum: "2026-09-25", iznos: 100000 }, SADA);
    await expect(platiUlazni(prisma, A, r, { datum: "2026-12-01", iznos: 100 }, SADA)).rejects.toThrow("budućnosti");
    const s = await prisma.ulazniRacun.findUniqueOrThrow({ where: { id: r } });
    const manje = await spremiUlazniRacun(prisma, A, r, ulaz({ zaRobu: false, osnovica: 50000, pdv: 12500, verzija: s.verzija }));
    expect(manje.ok).toBe(false);
    await expect(stornirajUlazniRacun(prisma, A, r, "greška")).rejects.toThrow("poništite");
    const pl = await prisma.placanjeUlaznog.findFirstOrThrow({ where: { ulazniRacunId: r } });
    await ponistiPlacanjeUlaznog(prisma, A, r, pl.id);
    await expect(ponistiPlacanjeUlaznog(prisma, A, r, pl.id)).rejects.toThrow("već poništeno");
    expect((await prisma.ulazniRacun.findUniqueOrThrow({ where: { id: r } })).placeno.toFixed(2)).toBe("0.00");
    await stornirajUlazniRacun(prisma, A, r, "greška");
    // URA: stornirani račun ne ulazi u knjigu
    const k = await popisZaKnjigovodju(prisma, A.firmaId, "2026-09");
    expect(k.ulazni.map((x) => x.broj)).toEqual(["OD-1"]);
    expect(await prisma.dnevnik.count({ where: { firmaId: A.firmaId, opis: { startsWith: "Poništeno plaćanje" } } })).toBe(1);
  });
});
