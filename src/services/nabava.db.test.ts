import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { spremiNarudzbenicu, zaprimiPoNarudzbenici, zatvoriNarudzbenicu } from "./nabava";
import { stornirajPrimku } from "./primke";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const s = await napraviKorisnika(prisma, firma.id, { uloga: "Skladištar" });
  const S: Akter = { firmaId: firma.id, korisnikId: s.id, prava: (await pravaClana(prisma, firma.id, s.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const dom = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Domaći d.o.o.", oib: "69435151530", kupac: false, dobavljac: true } });
  const eu = await prisma.partner.create({
    data: { firmaId: firma.id, naziv: "EU GmbH", drzava: "DE", pdvBroj: "DE123456789", kupac: false, dobavljac: true },
  });
  const p = await prisma.proizvodjac.create({ data: { firmaId: firma.id, naziv: "Dell" } });
  const kat = await prisma.kategorija.findFirstOrThrow({ where: { firmaId: firma.id } });
  const [m1, m2] = await Promise.all(
    ["Latitude", "OptiPlex"].map((naziv) =>
      prisma.modelUredaja.create({ data: { firmaId: firma.id, naziv, proizvodjacId: p.id, kategorijaId: kat.id } }),
    ),
  );
  return { firma, A, S, skl, dom, eu, m1: m1!, m2: m2! };
}

describe("narudžbenica i primka po narudžbenici", () => {
  it("PDV prema državi dobavljača; djelomično zaprimanje s nabavnom cijenom sa stavke; status; storno primke vraća količine", async () => {
    const { A, skl, dom, eu, m1, m2, firma } = await pripremi();
    const n = await spremiNarudzbenicu(prisma, A, null, {
      datum: "2026-09-20",
      dobavljacId: dom.id,
      napomena: null,
      verzija: 0,
      stavke: [
        { modelId: m1.id, kolicina: 3, cijena: 60000 },
        { modelId: m2.id, kolicina: 1, cijena: 40000 },
      ],
    });
    expect(n.broj).toBe("NAR-1/2026");
    expect(await prisma.narudzbenica.findUniqueOrThrow({ where: { id: n.id } })).toMatchObject({ pdvRezim: "HR", status: "OTVORENA" });
    const neu = await spremiNarudzbenicu(prisma, A, null, {
      datum: "2026-09-20",
      dobavljacId: eu.id,
      napomena: null,
      verzija: 0,
      stavke: [{ modelId: m1.id, kolicina: 1, cijena: 1 }],
    });
    expect((await prisma.narudzbenica.findUniqueOrThrow({ where: { id: neu.id } })).pdvRezim).toBe("EU");

    const st = await prisma.stavkaNarudzbenice.findMany({ where: { narudzbenicaId: n.id }, orderBy: { redoslijed: "asc" } });
    const p1 = await zaprimiPoNarudzbenici(
      prisma,
      A,
      n.id,
      {
        datum: "2026-09-25",
        skladisteId: skl.id,
        dokumentDobavljaca: "OTP-1",
        knjiziUTroskove: false,
        stavke: [{ stavkaId: st[0]!.id, serijski: ["DL-1", "DL-2"] }],
      },
      SADA,
    );
    expect(await prisma.uredaj.findFirstOrThrow({ where: { firmaId: firma.id, serijski: "DL-1" } })).toMatchObject({
      primkaId: p1.id,
      stavkaNarudzbeniceId: st[0]!.id,
    });
    expect((await prisma.uredaj.findFirstOrThrow({ where: { firmaId: firma.id, serijski: "DL-1" } })).nabavnaCijena?.toFixed(2)).toBe("600.00");
    expect((await prisma.primka.findUniqueOrThrow({ where: { id: p1.id } })).nabavnaVrijednost?.toFixed(2)).toBe("1200.00");
    expect((await prisma.narudzbenica.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("DJELOMICNO");
    // izmjena nakon zaprimanja nije moguća
    await expect(
      spremiNarudzbenicu(prisma, A, n.id, {
        datum: "2026-09-20",
        dobavljacId: dom.id,
        napomena: null,
        verzija: 2,
        stavke: [{ modelId: m1.id, kolicina: 1, cijena: 1 }],
      }),
    ).rejects.toThrow();
    // prekoračenje
    await expect(
      zaprimiPoNarudzbenici(
        prisma,
        A,
        n.id,
        {
          datum: "2026-09-25",
          skladisteId: skl.id,
          dokumentDobavljaca: null,
          knjiziUTroskove: false,
          stavke: [{ stavkaId: st[0]!.id, serijski: ["DL-3", "DL-4"] }],
        },
        SADA,
      ),
    ).rejects.toThrow("više nego što je naručeno");
    await zaprimiPoNarudzbenici(
      prisma,
      A,
      n.id,
      {
        datum: "2026-09-25",
        skladisteId: skl.id,
        dokumentDobavljaca: null,
        knjiziUTroskove: false,
        stavke: [
          { stavkaId: st[0]!.id, serijski: ["DL-3"] },
          { stavkaId: st[1]!.id, serijski: ["OP-1"] },
        ],
      },
      SADA,
    );
    expect((await prisma.narudzbenica.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("ZAPRIMLJENA");
    await stornirajPrimku(prisma, A, p1.id);
    expect((await prisma.stavkaNarudzbenice.findUniqueOrThrow({ where: { id: st[0]!.id } })).zaprimljeno).toBe(1);
    expect((await prisma.narudzbenica.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("DJELOMICNO");
  });

  it("dvije istovremene primke ne prelaze naručenu količinu", async () => {
    const { A, skl, dom, m1 } = await pripremi();
    const n = await spremiNarudzbenicu(prisma, A, null, {
      datum: "2026-09-20",
      dobavljacId: dom.id,
      napomena: null,
      verzija: 0,
      stavke: [{ modelId: m1.id, kolicina: 3, cijena: 1000 }],
    });
    const st = await prisma.stavkaNarudzbenice.findFirstOrThrow({ where: { narudzbenicaId: n.id } });
    const zaprimi = (s: string[]) =>
      zaprimiPoNarudzbenici(
        prisma,
        A,
        n.id,
        { datum: "2026-09-25", skladisteId: skl.id, dokumentDobavljaca: null, knjiziUTroskove: false, stavke: [{ stavkaId: st.id, serijski: s }] },
        SADA,
      );
    const r = await Promise.allSettled([zaprimi(["A-1", "A-2"]), zaprimi(["B-1", "B-2"])]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.stavkaNarudzbenice.findUniqueOrThrow({ where: { id: st.id } })).zaprimljeno).toBe(2);
  });

  it("bez prava na nabavne cijene: cijena se ne upisuje; zatvaranje, storno samo bez primki", async () => {
    const { A, S, skl, dom, m1 } = await pripremi();
    const n = await spremiNarudzbenicu(prisma, S, null, {
      datum: "2026-09-20",
      dobavljacId: dom.id,
      napomena: null,
      verzija: 0,
      stavke: [{ modelId: m1.id, kolicina: 2, cijena: 99999 }],
    });
    expect((await prisma.stavkaNarudzbenice.findFirstOrThrow({ where: { narudzbenicaId: n.id } })).cijena.toFixed(2)).toBe("0.00");
    const st = await prisma.stavkaNarudzbenice.findFirstOrThrow({ where: { narudzbenicaId: n.id } });
    await zaprimiPoNarudzbenici(
      prisma,
      S,
      n.id,
      {
        datum: "2026-09-25",
        skladisteId: skl.id,
        dokumentDobavljaca: null,
        knjiziUTroskove: false,
        stavke: [{ stavkaId: st.id, serijski: ["Z-1"] }],
      },
      SADA,
    );
    await expect(zatvoriNarudzbenicu(prisma, A, n.id, "STORNO")).rejects.toThrow("postoje primke");
    await zatvoriNarudzbenicu(prisma, A, n.id, "ZATVORI");
    await expect(
      zaprimiPoNarudzbenici(
        prisma,
        S,
        n.id,
        {
          datum: "2026-09-25",
          skladisteId: skl.id,
          dokumentDobavljaca: null,
          knjiziUTroskove: false,
          stavke: [{ stavkaId: st.id, serijski: ["Z-2"] }],
        },
        SADA,
      ),
    ).rejects.toThrow("zatvorena");
    await zatvoriNarudzbenicu(prisma, A, n.id, "OTVORI");
    expect((await prisma.narudzbenica.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("DJELOMICNO");
  });
});
