import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sFirmom } from "@/lib/firma-db";
import { pravaClana, type Akter } from "@/services/korisnici";
import { izdajRacun, spremiNacrt } from "@/services/prodaja";
import { dodajUplatu } from "@/services/uplate";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { popisProdaje, prodajniDokument, type FilterProdaje } from "./prodaja";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

describe("popis računa (upit)", () => {
  it("sva sortiranja; filtri plaćanja, statusa i pretrage; zbrojevi", async () => {
    const firma = await napraviFirmu(prisma);
    const k = await napraviKorisnika(prisma, firma.id);
    const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
    const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Alfa d.o.o." } });
    const napravi = async (cijena: number, izdaj = true) => {
      const n = await spremiNacrt(prisma, A, null, {
        vrsta: "RACUN",
        verzija: 0,
        partnerId: kupac.id,
        poslovnicaId: null,
        datum: "2026-09-25",
        vrijediDo: null,
        dospijece: null,
        popust: 0,
        napomena: null,
        stavke: [
          { vrsta: "RUCNA", namjena: "PRODAJA", naziv: "X", kpd: "62.09.20", jedinica: "kom", kolicina: 1000, cijena, popust: 0, stopa: 2500 },
        ],
      });
      if (izdaj) await izdajRacun(prisma, A, n.id, SADA);
      return n.id;
    };
    const neplacen = await napravi(8000);
    const placen = await napravi(4000);
    const preplacen = await napravi(2000);
    await napravi(1000, false);
    await dodajUplatu(prisma, A, placen, { datum: "2026-09-25", iznos: 5000, nacin: "T", opis: null }, SADA);
    await dodajUplatu(prisma, A, preplacen, { datum: "2026-09-25", iznos: 3000, nacin: "T", opis: null }, SADA);
    const db = sFirmom(prisma, firma.id);
    const f = (x: Partial<FilterProdaje> = {}): FilterProdaje => ({
      vrsta: [],
      status: [],
      sort: { kljuc: "datum", smjer: "desc" },
      stranica: 1,
      velicina: 25,
      ...x,
    });
    for (const kljuc of ["datum", "broj", "ukupno"] as const)
      for (const smjer of ["asc", "desc"] as const)
        expect((await popisProdaje(db, firma.id, f({ sort: { kljuc, smjer } }), ["RACUN"])).ukupno).toBe(4);
    const ids = async (x: Partial<FilterProdaje>) => (await popisProdaje(db, firma.id, f(x), ["RACUN"])).redovi.map((r) => r.id).sort();
    expect(await ids({ placanje: "OTVORENI" })).toEqual([neplacen]);
    expect(await ids({ placanje: "ZA_POVRAT" })).toEqual([preplacen]);
    expect(await ids({ placanje: "PLACENI" })).toEqual([placen]);
    expect(await ids({ status: ["NACRT"] })).toHaveLength(1);
    expect(await ids({ trazi: "alfa" })).toHaveLength(4);
    expect(await ids({ vrsta: ["PONUDA"] })).toHaveLength(4); // vrsta izvan dopuštenih se zanemaruje
    const r = await popisProdaje(db, firma.id, f(), ["RACUN"]);
    // izdano: 100 + 50 + 25 = 175,00; plaćeno 50 + 30 → otvoreno 95,00
    expect([r.zbrojUkupno, r.zbrojOtvoreno]).toEqual([17500, 9500]);
    expect((await prodajniDokument(db, firma.id, placen))!.uplate).toHaveLength(1);
  });
});
