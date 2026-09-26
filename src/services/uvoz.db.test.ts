import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { izdajRacun, spremiNacrt } from "./prodaja";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { pripremiUvoz, uvezi } from "./uvoz";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const DANAS = "2026-09-26";
const primjer = () => JSON.parse(readFileSync("docs/primjer-uvoza.json", "utf8")) as Record<string, unknown>;

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id);
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))!, ip: null };
  return { f: firma.id, A };
}

describe("uvoz iz starog programa", () => {
  it("provjera: izvještaj razlika, zbrojevi po godinama i nastavak numeracije; ništa se ne piše", async () => {
    const { f } = await pripremi();
    const p = primjer();
    (p["racuni"] as Record<string, unknown>[])[0]!["ukupno"] = "1191.00"; // stari program je zaokružio drukčije
    const r = await pripremiUvoz(prisma, f, p, DANAS);
    expect(r.greske).toEqual([]);
    expect(r.razlike).toEqual([{ broj: "41/PP1/1", datum: "2025-11-20", stari: 119100, novi: 119125 }]);
    expect(r.poGodinama).toEqual([{ godina: 2025, racuna: 1, stari: 119100, novi: 119125, placeno: 119125 }]);
    expect(r.numeracija).toEqual([{ niz: "PP1/1", godina: 2025, sljedeci: 42 }]);
    expect(r.brojevi).toMatchObject({ uredaji: 4, racuni: 1, ugovoriNajma: 1, partneri: 2, skladista: 1 }); // „Glavno skladište“ već postoji
    expect(await prisma.uredaj.count()).toBe(0);
  });

  it("uvoz: uređaji u stanjima, račun zaključan s istim iznosima i uplatom, numeracija se nastavlja, najam naplaćen do mjeseca", async () => {
    const { f, A } = await pripremi();
    const r = await uvezi(prisma, A, primjer(), DANAS);
    expect(r.ugovoriGreske).toEqual([]);

    const ur = Object.fromEntries(
      (await prisma.uredaj.findMany({ where: { firmaId: f }, include: { skladiste: true, partner: true } })).map((u) => [u.serijski, u]),
    );
    expect(ur["UV-0001"]).toMatchObject({ stanje: "NA_SKLADISTU", skladiste: { naziv: "Split" } });
    expect(ur["UV-0001"]!.nabavnaCijena!.toFixed(2)).toBe("650.00");
    expect(ur["UV-0002"]).toMatchObject({ stanje: "PRODAN", partner: { naziv: "Primjer d.o.o." } });
    expect(ur["UV-0003"]).toMatchObject({ stanje: "U_NAJMU", partner: { naziv: "Primjer d.o.o." } });
    expect(ur["UV-0004"]).toMatchObject({ stanje: "OTPISAN", skladisteId: null });
    expect(await prisma.dogadajUredaja.count({ where: { firmaId: f, radnja: "uvoz" } })).toBe(4);

    const rac = await prisma.prodajniDokument.findFirstOrThrow({
      where: { firmaId: f, broj: "41/PP1/1" },
      include: { stavke: { orderBy: { redoslijed: "asc" }, include: { uredaji: true } }, uplate: true },
    });
    expect(rac).toMatchObject({ status: "IZDAN", godina: 2025, redni: 41, fiskalStatus: "FISKALIZIRAN", fiskalNacin: "PRODUKCIJA" });
    expect([rac.osnovica, rac.pdv, rac.ukupno, rac.placeno].map((x) => x.toFixed(2))).toEqual(["953.00", "238.25", "1191.25", "1191.25"]);
    expect(rac.stavke.map((s) => [s.vrsta, s.iznos.toFixed(2)])).toEqual([
      ["UREDAJ", "899.00"],
      ["RUCNA", "54.00"],
    ]);
    expect(rac.stavke[0]!.uredaji.map((x) => x.uredajId)).toEqual([ur["UV-0002"]!.id]);
    expect(rac.uplate).toHaveLength(1);
    expect(await prisma.eIzvjestaj.count()).toBe(0);

    // sljedeći račun u istom nizu i godini dobiva broj iza zadnjeg uvezenog
    const kupac = await prisma.partner.findFirstOrThrow({ where: { firmaId: f, oib: "33392005961" } });
    const n = await spremiNacrt(prisma, A, null, {
      vrsta: "RACUN",
      verzija: 0,
      partnerId: kupac.id,
      poslovnicaId: null,
      datum: "2025-12-15",
      vrijediDo: null,
      dospijece: "2025-12-30",
      popust: 0,
      napomena: null,
      stavke: [
        {
          vrsta: "RUCNA",
          namjena: "PRODAJA",
          naziv: "Usluga",
          kpd: "62.09.20",
          jedinica: "kom",
          kolicina: 1000,
          cijena: 1000,
          popust: 0,
          stopa: 2500,
          vrstaIsporuke: "USLUGA",
        },
      ],
    });
    expect((await izdajRacun(prisma, A, n.id)).broj).toBe("42/PP1/1");

    // najam: rate do 12/2025 označene kao izdane izvan programa (lipanj–prosinac = 7 × 12,00)
    const ug = await prisma.ugovorNajma.findFirstOrThrow({ where: { firmaId: f, broj: "UG-17/2025" } });
    const rate = await prisma.rataNajma.findMany({ where: { firmaId: f, plan: { ugovorId: ug.id } } });
    expect(rate).toHaveLength(7);
    expect(rate.reduce((s, x) => s + Number(x.iznos), 0)).toBe(84);
    expect(rate.every((x) => x.dokumentId === null)).toBe(true);

    // ponovni uvoz iste datoteke: greške, ništa se ne mijenja
    const p2 = await pripremiUvoz(prisma, f, primjer(), DANAS);
    expect(p2.greske.map((g) => g.poruka).join("\n")).toMatch(
      /UV-0001 već postoji[\s\S]*Broj 41\/PP1\/1 u 2025\. već postoji[\s\S]*UG-17\/2025 već postoji/,
    );
    await expect(uvezi(prisma, A, primjer(), DANAS)).rejects.toThrow("grešaka");
  });

  it("postojeći partner (isti OIB) i šifrarnici se koriste, ne dupliciraju", async () => {
    const { f, A } = await pripremi();
    const postoji = await prisma.partner.create({ data: { firmaId: f, naziv: "Primjer (stari naziv)", oib: "33392005961" } });
    const r = await pripremiUvoz(prisma, f, primjer(), DANAS);
    expect(r.upozorenja.map((u) => u.poruka).join("\n")).toMatch(/već postoji kao „Primjer \(stari naziv\)“/);
    await uvezi(prisma, A, primjer(), DANAS);
    expect(await prisma.partner.count({ where: { firmaId: f, oib: "33392005961" } })).toBe(1);
    expect((await prisma.uredaj.findFirstOrThrow({ where: { serijski: "UV-0002" } })).partnerId).toBe(postoji.id);
    expect(await prisma.skladiste.count({ where: { firmaId: f, naziv: "Glavno skladište" } })).toBe(1);
    expect(await prisma.kategorija.count({ where: { firmaId: f, naziv: "Monitor" } })).toBe(1);
  });

  it("ispravci pregleda: broj zauzet stornom, izvještaj = uvezeni iznosi (grupirani uređaji), uvezeni račun se ne šalje kao eRačun", async () => {
    const { f, A } = await pripremi();
    // storno 7/PP1/1 u 2025. već postoji (isti niz brojeva kao računi)
    await prisma.prodajniDokument.create({
      data: { firmaId: f, vrsta: "STORNO", status: "IZDAN", broj: "7/PP1/1", godina: 2025, redni: 7, datum: new Date("2025-03-01") },
    });
    const p = primjer();
    const r0 = (p["racuni"] as Record<string, unknown>[])[0]!;
    (p["racuni"] as unknown[]).push({ ...r0, broj: "07/PP1/1", jir: null, zki: null, uplate: [] });
    expect((await pripremiUvoz(prisma, f, p, DANAS)).greske.map((g) => g.poruka).join("\n")).toMatch(/Broj 7\/PP1\/1 u 2025\. već postoji/);

    // dva ista uređaja s popustom: izvještaj prije uvoza = spremljeni iznos (isto grupiranje i zaokruživanje)
    const q = primjer();
    (q["uredaji"] as unknown[]).push({ serijski: "UV-0005", model: "DL-5440", stanje: "PRODAN", partner: "K001" });
    (q["racuni"] as unknown[]).push({
      broj: "60/PP1/1",
      datum: "2025-12-02",
      partner: "K001",
      stavke: [
        { naziv: "Dell", serijski: "UV-0001", cijena: "333.33", popust: 7 },
        { naziv: "Dell", serijski: "UV-0005", cijena: "333.33", popust: 7 },
      ],
      ukupno: "0.01",
    });
    const pr = await pripremiUvoz(prisma, f, q, DANAS);
    const najavljeno = pr.razlike.find((x) => x.broj === "60/PP1/1")!.novi;
    await uvezi(prisma, A, q, DANAS);
    const d = await prisma.prodajniDokument.findFirstOrThrow({ where: { firmaId: f, broj: "60/PP1/1" } });
    expect(Math.round(Number(d.ukupno) * 100)).toBe(najavljeno);

    const { posaljiERacun } = await import("./eracun");
    await expect(posaljiERacun(prisma, A, d.id)).rejects.toThrow("uvezen iz starog programa");
  });
});
