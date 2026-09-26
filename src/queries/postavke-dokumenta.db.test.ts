import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sFirmom } from "@/lib/firma-db";
import { pdfDokumenta } from "@/lib/pdf-dokumenta";
import { postaviPocetniBroj } from "@/services/brojac";
import { pravaClana, type Akter } from "@/services/korisnici";
import { postaviLogo, spremiPostavkeFirme, type UlazPostavki } from "@/services/postavke";
import { izdajRacun, spremiNacrt } from "@/services/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { podaciZaPdf } from "./prodaja-pdf";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");
// najmanji ispravan PNG (1×1)
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

const postavke = (x: Partial<UlazPostavki> = {}): UlazPostavki => ({
  adresa: "Ilica 1",
  postanskiBroj: "10000",
  mjesto: "Zagreb",
  email: null,
  telefon: "01 555 666",
  web: null,
  iban: "HR1210010051863000160",
  banka: "Zagrebačka banka",
  uSustavuPdv: true,
  pdvPoNaplacenoj: false,
  oznakaProstora: "PP1",
  oznakaUredaja: "1",
  rokPlacanjaDana: 15,
  podnozje: "Trgovački sud u Zagrebu",
  smtpHost: null,
  smtpPort: null,
  smtpSigurno: true,
  smtpKorisnik: null,
  smtpLozinka: null,
  epostaPosiljatelj: null,
  epostaKopija: null,
  boja: "#aa0000",
  kpdRoba: "26.20.11",
  kpdUsluga: "62.02.30",
  kpdNajam: "77.33.11",
  ...x,
});

describe("postavke firme vidljive na dokumentu (6.5)", () => {
  it("logo, boja, podnožje, IBAN, zadani KPD i početni broj na računu; izdani račun pamti postavke", async () => {
    const firma = await napraviFirmu(prisma, "Firma d.o.o.");
    const k = await napraviKorisnika(prisma, firma.id, { uloga: "Administrator" });
    const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
    expect(await spremiPostavkeFirme(prisma, A, postavke({ boja: "crvena", kpdRoba: "x" }))).toMatchObject({
      boja: expect.any(String),
      kpdRoba: expect.any(String),
    });
    expect(await spremiPostavkeFirme(prisma, A, postavke())).toEqual({});
    await expect(postaviLogo(prisma, A, new Uint8Array([1, 2, 3]))).rejects.toThrow("PNG");
    await postaviLogo(prisma, A, PNG);
    await postaviPocetniBroj(prisma, A, "racun:PP1:1", 2026, 150);
    const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o." } });
    const stavka = (vrsta: "RUCNA", naziv: string, stopa = 2500) => ({
      vrsta,
      namjena: "PRODAJA" as const,
      naziv,
      kpd: null,
      jedinica: "kom",
      kolicina: 1000,
      cijena: 10000,
      popust: 0,
      stopa,
    });
    const n = await spremiNacrt(prisma, A, null, {
      vrsta: "RACUN",
      verzija: 0,
      partnerId: kupac.id,
      poslovnicaId: null,
      datum: "2026-09-25",
      vrijediDo: null,
      dospijece: "2026-10-10",
      popust: 0,
      napomena: null,
      stavke: [stavka("RUCNA", "Laptop")],
    });
    expect((await prisma.stavkaProdajnogDokumenta.findFirstOrThrow({ where: { dokumentId: n.id } })).kpd).toBe("26.20.11");
    await izdajRacun(prisma, A, n.id, SADA);
    const db = sFirmom(prisma, firma.id);
    const r = (await podaciZaPdf(db, firma.id, n.id))!;
    expect(r.podaci.broj).toBe("150/PP1/1");
    expect(r.podaci.firma).toMatchObject({ boja: "#aa0000", iban: "HR1210010051863000160", banka: "Zagrebačka banka" });
    expect(r.podaci.firma.logo?.vrsta).toBe("image/png");
    expect(r.podaci.podnozje).toContain("Trgovački sud");
    expect((await pdfDokumenta(r.podaci)).subarray(0, 4).toString()).toBe("%PDF");

    // promjena postavki nakon izdavanja: izdani račun ostaje kakav je bio
    await spremiPostavkeFirme(prisma, A, postavke({ boja: "#0000aa", podnozje: "Novo podnožje" }));
    await postaviLogo(prisma, A, null);
    const opet = (await podaciZaPdf(db, firma.id, n.id))!;
    expect(opet.podaci.firma.boja).toBe("#aa0000");
    expect(opet.podaci.firma.logo?.vrsta).toBe("image/png");
    expect(opet.podaci.podnozje).toContain("Trgovački sud");
  });
});
