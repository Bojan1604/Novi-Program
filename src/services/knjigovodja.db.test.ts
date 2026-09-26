import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { oznaciPredaju, popisZaKnjigovodju, posaljiKnjigovodji, zipZaKnjigovodju } from "./knjigovodja";
import { spremiNarudzbenicu, zaprimiPoNarudzbenici } from "./nabava";
import { dodajPriloge } from "./prilozi";
import { izdajRacun, spremiNacrt } from "./prodaja";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { spremiUlazniRacun } from "./ulazni-racuni";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await prisma.firma.update({ where: { id: firma.id }, data: { iban: "HR1210010051863000160" } });
  await napraviZadaneSifrarnike(prisma, firma.id);
  const akter = async (uloga: string) => {
    const k = await napraviKorisnika(prisma, firma.id, { uloga });
    return { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! } satisfies Akter;
  };
  const A = await akter("Administrator");
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o.", oib: "69435151530" } });
  const dob = await prisma.partner.create({
    data: { firmaId: firma.id, naziv: "Dobavljač d.o.o.", oib: "94577403194", kupac: false, dobavljac: true },
  });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const m = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "Latitude", proizvodjacId: p.id, kategorijaId: kat.id } });
  // izlazni račun u rujnu
  const n = await spremiNacrt(prisma, A, null, {
    vrsta: "RACUN",
    verzija: 0,
    partnerId: kupac.id,
    poslovnicaId: null,
    datum: "2026-09-10",
    vrijediDo: null,
    dospijece: null,
    popust: 0,
    napomena: null,
    stavke: [
      { vrsta: "RUCNA", namjena: "PRODAJA", naziv: "Servis", kpd: "95.11.10", jedinica: "h", kolicina: 1000, cijena: 10000, popust: 0, stopa: 2500 },
    ],
  });
  await izdajRacun(prisma, A, n.id, new Date("2026-09-10T10:00:00Z"));
  // nabava: narudžbenica, primka, ulazni račun s prilogom
  const nar = await spremiNarudzbenicu(prisma, A, null, {
    datum: "2026-09-05",
    dobavljacId: dob.id,
    napomena: null,
    verzija: 0,
    stavke: [{ modelId: m.id, kolicina: 1, cijena: 70000 }],
  });
  const st = await prisma.stavkaNarudzbenice.findFirstOrThrow({ where: { narudzbenicaId: nar.id } });
  await zaprimiPoNarudzbenici(
    prisma,
    A,
    nar.id,
    { datum: "2026-09-06", skladisteId: skl.id, dokumentDobavljaca: null, knjiziUTroskove: true, stavke: [{ stavkaId: st.id, serijski: ["K-1"] }] },
    new Date("2026-09-20T10:00:00Z"),
  );
  const u = await spremiUlazniRacun(prisma, A, null, {
    broj: "UR-9",
    datum: "2026-09-07",
    dospijece: null,
    dobavljacId: dob.id,
    dobavljacTekst: null,
    dobavljacOib: null,
    narudzbenicaId: nar.id,
    primkaId: null,
    zaRobu: true,
    osnovica: 70000,
    pdv: 17500,
    opis: null,
    verzija: 0,
  });
  if (!u.ok) throw new Error();
  await dodajPriloge(prisma, A, "UlazniRacun", u.id, [{ naziv: "ur-9.pdf", velicina: 8, sadrzaj: new TextEncoder().encode("%PDF-1.4") }]);
  return { firma, A, akter };
}

describe("knjigovođa", () => {
  it("ZIP: PDF i XML izlaznih, prilozi ulaznih, knjige; bez prava nabavnih cijena nema troška robe", async () => {
    const { A, akter } = await pripremi();
    const z = await zipZaKnjigovodju(prisma, A, "2026-09");
    const d = unzipSync(z.zip);
    const imena = Object.keys(d).sort();
    expect(imena).toEqual(
      expect.arrayContaining([
        "izlazni/1-PP1-1.pdf",
        "izlazni/1-PP1-1.xml",
        "knjiga-IRA.csv",
        "knjiga-URA.csv",
        "troskovi.csv",
        "ulazni/URA-1-2026 UR-9/ur-9.pdf",
      ]),
    );
    expect(strFromU8(d["izlazni/1-PP1-1.pdf"]!.slice(0, 5))).toBe("%PDF-");
    expect(strFromU8(d["knjiga-IRA.csv"]!)).toContain("1/PP1/1");
    expect(strFromU8(d["troskovi.csv"]!)).toContain("NAR-1/2026");
    // voditelj bez prava nabavnih cijena
    const V = await akter("Voditelj");
    await prisma.clanstvoFirme.updateMany({ where: { korisnikId: V.korisnikId }, data: { iznimke: { posebna: { costs: false } } } });
    const bez = { ...V, prava: (await pravaClana(prisma, V.firmaId, V.korisnikId))! };
    const z2 = unzipSync((await zipZaKnjigovodju(prisma, bez, "2026-09")).zip);
    expect(strFromU8(z2["troskovi.csv"]!)).not.toContain("NAR-1/2026");
    expect(strFromU8(z2["troskovi.csv"]!)).not.toContain("700,00");
  });

  it("označi poslano: novi dokumenti nakon predaje se ističu; slanje e-poštom (testni prijevoz) pamti adresu", async () => {
    const { A, firma } = await pripremi();
    const p1 = await popisZaKnjigovodju(prisma, firma.id, "2026-09");
    expect(p1.izlazni.every((x) => x.novo)).toBe(true);
    await oznaciPredaju(prisma, A, "2026-09", "RUCNO");
    const p2 = await popisZaKnjigovodju(prisma, firma.id, "2026-09");
    expect(p2.izlazni.some((x) => x.novo)).toBe(false);
    expect(p2.predaje).toHaveLength(1);
    const prije = process.env["EPOSTA_NACIN"];
    process.env["EPOSTA_NACIN"] = "test";
    try {
      await posaljiKnjigovodji(prisma, A, "2026-09", "knjigovodja@primjer.hr");
    } finally {
      process.env["EPOSTA_NACIN"] = prije;
    }
    expect((await prisma.firma.findUniqueOrThrow({ where: { id: firma.id } })).epostaKnjigovodje).toBe("knjigovodja@primjer.hr");
    expect((await popisZaKnjigovodju(prisma, firma.id, "2026-09")).predaje[0]).toMatchObject({ nacin: "EPOSTA", prima: "knjigovodja@primjer.hr" });
  });
});
