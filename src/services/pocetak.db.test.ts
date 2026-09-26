import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZADANO } from "@/domain/pocetak";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, promijeniVlastitePodatke, type Akter } from "./korisnici";
import { spremiPostavkeFirme, type UlazPostavki } from "./postavke";
import { napraviPrvogAdmina, prijavi } from "./prijava";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const postavke = (x: Partial<UlazPostavki> = {}): UlazPostavki => ({
  adresa: null,
  postanskiBroj: null,
  mjesto: null,
  email: null,
  telefon: null,
  web: null,
  iban: null,
  banka: null,
  uSustavuPdv: true,
  pdvPoNaplacenoj: false,
  oznakaProstora: "PP1",
  oznakaUredaja: "1",
  rokPlacanjaDana: 15,
  podnozje: null,
  smtpHost: null,
  smtpPort: null,
  smtpSigurno: true,
  smtpKorisnik: null,
  smtpLozinka: null,
  epostaPosiljatelj: null,
  epostaKopija: null,
  boja: null,
  kpdRoba: null,
  kpdUsluga: null,
  kpdNajam: null,
  ...x,
});

describe("prvo pokretanje bez pitanja", () => {
  it("zadana firma i administrator; u programu svoja e-pošta, lozinka, naziv i OIB firme", async () => {
    const { firmaId, korisnikId } = await napraviPrvogAdmina(prisma, {
      nazivFirme: ZADANO.firma,
      oib: ZADANO.oib,
      ime: ZADANO.ime,
      email: ZADANO.email,
      lozinka: ZADANO.lozinka,
    });
    const p = await prijavi(prisma, { email: ZADANO.email, lozinka: ZADANO.lozinka, ip: "1.1.1.1" });
    expect(p.ok).toBe(true);
    const A: Akter = { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))!, ip: null };

    // svoji podaci: traži lozinku, e-pošta mora biti slobodna
    const druga = await napraviFirmu(prisma, "Druga");
    await napraviKorisnika(prisma, druga.id, { email: "zauzeto@firma.hr" });
    await expect(promijeniVlastitePodatke(prisma, A, { ime: "Bojan", email: "bojan@firma.hr", lozinka: "kriva-lozinka" })).rejects.toThrow("lozinka");
    await expect(promijeniVlastitePodatke(prisma, A, { ime: "Bojan", email: "zauzeto@firma.hr", lozinka: ZADANO.lozinka })).rejects.toThrow(
      "zauzeta",
    );
    await promijeniVlastitePodatke(prisma, A, { ime: "Bojan M.", email: "Bojan@Firma.hr", lozinka: ZADANO.lozinka });
    expect(await prisma.korisnik.findUniqueOrThrow({ where: { id: korisnikId } })).toMatchObject({ ime: "Bojan M.", email: "bojan@firma.hr" });
    expect((await prijavi(prisma, { email: "bojan@firma.hr", lozinka: ZADANO.lozinka, ip: "1.1.1.2" })).ok).toBe(true);

    // naziv i OIB firme u postavkama
    expect(await spremiPostavkeFirme(prisma, A, postavke({ naziv: " ", oib: "12345678901" }))).toMatchObject({
      naziv: expect.any(String),
      oib: expect.any(String),
    });
    expect(await spremiPostavkeFirme(prisma, A, postavke({ naziv: "Moja prava d.o.o.", oib: druga.oib }))).toMatchObject({
      oib: "Firma s tim OIB-om već postoji.",
    });
    expect(await spremiPostavkeFirme(prisma, A, postavke({ naziv: "Moja prava d.o.o.", oib: "69435151530" }))).toEqual({});
    expect(await prisma.firma.findUniqueOrThrow({ where: { id: firmaId } })).toMatchObject({ naziv: "Moja prava d.o.o.", oib: "69435151530" });
  });
});
