import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { popraviDosljednost, provjeriDosljednost } from "./dosljednost";
import { pravaClana, type Akter } from "./korisnici";
import { spremiNarudzbenicu, zaprimiPoNarudzbenici } from "./nabava";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Administrator" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const dob = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Domaći d.o.o.", oib: "69435151530", kupac: false, dobavljac: true } });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const m = await prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv: "Latitude", proizvodjacId: p.id, kategorijaId: kat.id } });
  return { firma, A, skl, dob, m };
}

describe("provjera dosljednosti", () => {
  it("dosljedni podaci nemaju nalaza; pokvareni se nađu, popravak ih ispravlja i zapisuje u dnevnik; druga firma netaknuta", async () => {
    const { firma, A, skl, dob, m } = await pripremi();
    const n = await spremiNarudzbenicu(prisma, A, null, {
      datum: "2026-09-20",
      dobavljacId: dob.id,
      napomena: null,
      verzija: 0,
      stavke: [{ modelId: m.id, kolicina: 3, cijena: 60000 }],
    });
    const st = await prisma.stavkaNarudzbenice.findFirstOrThrow({ where: { narudzbenicaId: n.id } });
    const pr = await zaprimiPoNarudzbenici(prisma, A, n.id, {
      datum: "2026-09-25",
      skladisteId: skl.id,
      dokumentDobavljaca: "OTP-1",
      knjiziUTroskove: false,
      stavke: [{ stavkaId: st.id, serijski: ["DL-1", "DL-2"] }],
    });
    expect(await provjeriDosljednost(prisma, firma.id)).toEqual([]);

    // kvar: zapisane količine/vrijednosti ne odgovaraju, uređaj na skladištu bez skladišta
    await prisma.stavkaNarudzbenice.update({ where: { id: st.id }, data: { zaprimljeno: 3 } });
    await prisma.narudzbenica.update({ where: { id: n.id }, data: { status: "ZAPRIMLJENA" } });
    await prisma.primka.update({ where: { id: pr.id }, data: { nabavnaVrijednost: "1.00", brojUredaja: 7 } });
    await prisma.uredaj.updateMany({ where: { firmaId: firma.id, serijski: "DL-2" }, data: { skladisteId: null } });
    // druga firma s istim kvarom ne smije se dirati
    const druga = await pripremi();
    const n2 = await spremiNarudzbenicu(prisma, druga.A, null, {
      datum: "2026-09-20",
      dobavljacId: druga.dob.id,
      napomena: null,
      verzija: 0,
      stavke: [{ modelId: druga.m.id, kolicina: 1, cijena: 100 }],
    });
    await prisma.stavkaNarudzbenice.updateMany({ where: { narudzbenicaId: n2.id }, data: { zaprimljeno: 1 } });

    const nalazi = await provjeriDosljednost(prisma, firma.id);
    expect(nalazi.map((x) => x.vrsta).sort()).toEqual(["BROJ_NA_PRIMCI", "STANJE_SKLADISTE", "VRIJEDNOST_PRIMKE", "ZAPRIMLJENO"]);
    expect(nalazi.find((x) => x.vrsta === "ZAPRIMLJENO")?.opis).toBe("NAR-1/2026: zapisano 3, na primkama 2");

    expect(await popraviDosljednost(prisma, A)).toBe(3);
    expect(await prisma.stavkaNarudzbenice.findUniqueOrThrow({ where: { id: st.id } })).toMatchObject({ zaprimljeno: 2 });
    expect((await prisma.narudzbenica.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("DJELOMICNO");
    const p = await prisma.primka.findUniqueOrThrow({ where: { id: pr.id } });
    expect([p.nabavnaVrijednost?.toFixed(2), p.brojUredaja]).toEqual(["1200.00", 2]);
    // ostaje samo ono što se popravlja ručno
    expect((await provjeriDosljednost(prisma, firma.id)).map((x) => x.vrsta)).toEqual(["STANJE_SKLADISTE"]);
    const dnevnik = await prisma.dnevnik.findMany({ where: { firmaId: firma.id, radnja: "dosljednost.popravak" } });
    expect(dnevnik).toHaveLength(3);
    expect(dnevnik.every((d) => d.korisnikId === A.korisnikId)).toBe(true);
    // druga firma: kvar i dalje postoji
    expect((await provjeriDosljednost(prisma, druga.firma.id)).map((x) => x.vrsta)).toContain("ZAPRIMLJENO");
    expect(await popraviDosljednost(prisma, A)).toBe(0);
  });

  it("1.000 narudžbenica provjerava ispod 2 s", async () => {
    const { firma, dob, m } = await pripremi();
    const narudzbe = Array.from({ length: 1000 }, (_, i) => ({
      id: crypto.randomUUID(),
      firmaId: firma.id,
      broj: `NAR-${i + 1}/2026`,
      godina: 2026,
      redni: i + 1,
      datum: new Date("2026-09-01"),
      dobavljacId: dob.id,
      pdvRezim: "HR",
    }));
    await prisma.narudzbenica.createMany({ data: narudzbe });
    await prisma.stavkaNarudzbenice.createMany({
      data: narudzbe.flatMap((x) =>
        [0, 1, 2].map((r) => ({ firmaId: firma.id, narudzbenicaId: x.id, redoslijed: r, modelId: m.id, kolicina: 2, cijena: "100.00" })),
      ),
    });
    await provjeriDosljednost(prisma, firma.id); // zagrijavanje
    const t = performance.now();
    const nalazi = await provjeriDosljednost(prisma, firma.id);
    expect(performance.now() - t).toBeLessThan(2000);
    expect(nalazi).toEqual([]);
  });
});
