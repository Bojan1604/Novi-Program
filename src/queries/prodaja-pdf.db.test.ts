import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sFirmom } from "@/lib/firma-db";
import { pdfDokumenta } from "@/lib/pdf-dokumenta";
import { pravaClana, type Akter } from "@/services/korisnici";
import { izdajRacun, spremiNacrt, stornirajRacun } from "@/services/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { podaciZaPdf } from "./prodaja-pdf";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

describe("PDF prodajnog dokumenta (podaci)", () => {
  it("izdani račun iz snimke, HUB3 s pozivom na broj; storno bez HUB3; nacrt s vodenim žigom", async () => {
    const firma = await napraviFirmu(prisma, "Izvorna d.o.o.");
    await prisma.firma.update({
      where: { id: firma.id },
      data: { iban: "HR1210010051863000160", adresa: "Ilica 1", postanskiBroj: "10000", mjesto: "Zagreb" },
    });
    const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj", ime: "Vesna" });
    const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
    const skl = await prisma.skladiste.create({ data: { firmaId: firma.id, naziv: "S", zadano: true } });
    const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac Žuti d.o.o.", adresa: "Vukovarska 5", mjesto: "Split" } });
    const n = await spremiNacrt(prisma, A, null, {
      vrsta: "RACUN",
      verzija: 0,
      partnerId: kupac.id,
      poslovnicaId: null,
      datum: "2026-09-25",
      vrijediDo: null,
      dospijece: "2026-10-10",
      popust: 1000,
      napomena: "Hvala!",
      stavke: [
        {
          vrsta: "RUCNA",
          namjena: "PRODAJA",
          naziv: "Oprema",
          kpd: "26.20.11",
          jedinica: "kom",
          kolicina: 2000,
          cijena: 50000,
          popust: 0,
          stopa: 2500,
        },
      ],
    });
    const db = sFirmom(prisma, firma.id);
    const nacrt = (await podaciZaPdf(db, firma.id, n.id))!;
    expect(nacrt.podaci).toMatchObject({ nacrt: true, broj: null, hub3: null });
    await izdajRacun(prisma, A, n.id, SADA);
    await prisma.firma.update({ where: { id: firma.id }, data: { naziv: "Promijenjena d.o.o.", iban: null } });
    const r = (await podaciZaPdf(db, firma.id, n.id))!;
    expect(r.podaci.firma.naziv).toBe("Izvorna d.o.o.");
    expect(r.podaci.podaci).toContainEqual(["Poziv na broj", "HR00 1-2026"]);
    expect(r.podaci.podaci).toContainEqual(["Operater", "Vesna"]);
    expect(r.podaci.zbrojevi).toEqual([
      ["Popust", "-100,00 €"],
      ["Osnovica (25 %)", "900,00 €"],
      ["PDV 25 %", "225,00 €"],
    ]);
    expect(r.podaci.zaPlatiti).toEqual(["Ukupno za platiti", "1.125,00 €"]);
    expect(r.podaci.hub3?.split("\n")[2]).toBe("000000000112500");
    expect(r.datoteka).toBe("Račun-1-PP1-1.pdf");
    expect(((await pdfDokumenta(r.podaci)).toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBe(1);

    const s = await stornirajRacun(prisma, A, n.id, skl.id, SADA);
    const st = (await podaciZaPdf(db, firma.id, s.id))!;
    expect(st.podaci).toMatchObject({ naslov: "Storno računa", hub3: null, zaPlatiti: ["Ukupno", "-1.125,00 €"] });
    expect(st.podaci.podaci).toContainEqual(["Za račun", "1/PP1/1"]);
    expect(await podaciZaPdf(db, firma.id, "nije-uuid")).toBeNull();
  });
});
