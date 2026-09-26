import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { izdajRacun, spremiNacrt } from "./prodaja";
import { dodajUplatu, ponistiUplatu } from "./uplate";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");

async function racun(ukupnoBezPdv: number) {
  const firma = await napraviFirmu(prisma);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Prodavač" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const n = await spremiNacrt(prisma, A, null, {
    vrsta: "RACUN",
    verzija: 0,
    partnerId: null,
    poslovnicaId: null,
    datum: "2026-09-25",
    vrijediDo: null,
    dospijece: null,
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
        cijena: ukupnoBezPdv,
        popust: 0,
        stopa: 2500,
        vrstaIsporuke: "USLUGA",
      },
    ],
  });
  await izdajRacun(prisma, A, n.id, SADA);
  return { A, id: n.id };
}
const uplata = (datum: string, iznos: number) => ({ datum, iznos, nacin: "T", opis: null });

describe("uplate", () => {
  it("djelomična, preplata, povrat, poništavanje — otvoreno i za povrat točni; placeno na računu", async () => {
    const { A, id } = await racun(8000); // 100,00 s PDV-om
    expect(await dodajUplatu(prisma, A, id, uplata("2026-09-25", 4000), SADA)).toMatchObject({ otvoreno: 6000, status: "DJELOMICNO" });
    expect(await dodajUplatu(prisma, A, id, uplata("2026-09-25", 8000), SADA)).toMatchObject({ otvoreno: 0, zaPovrat: 2000, status: "PREPLACEN" });
    await expect(dodajUplatu(prisma, A, id, uplata("2026-09-25", -2001), SADA)).rejects.toThrow("najviše 20,00");
    expect(await dodajUplatu(prisma, A, id, uplata("2026-09-25", -2000), SADA)).toMatchObject({ zaPovrat: 0, status: "PLACEN" });
    const prva = await prisma.uplata.findFirstOrThrow({ where: { dokumentId: id, iznos: "40.00" } });
    await expect(ponistiUplatu(prisma, A, prva.id, " ")).rejects.toThrow("razlog");
    expect(await ponistiUplatu(prisma, A, prva.id, "Pogrešan račun")).toMatchObject({ otvoreno: 4000, status: "DJELOMICNO" });
    await expect(ponistiUplatu(prisma, A, prva.id, "opet")).rejects.toThrow("već poništena");
    expect((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id } })).placeno.toFixed(2)).toBe("60.00");
    expect(await prisma.dnevnik.count({ where: { entitetId: id, radnja: { startsWith: "uplate." } } })).toBe(4);
  });

  it("budući datum, nacrt i nula odbijeni; istovremene uplate se ne gube", async () => {
    const { A, id } = await racun(8000);
    await expect(dodajUplatu(prisma, A, id, uplata("2026-09-26", 100), SADA)).rejects.toThrow("budućnosti");
    await expect(dodajUplatu(prisma, A, id, uplata("2026-09-25", 0), SADA)).rejects.toThrow("Upišite iznos");
    await Promise.all(Array.from({ length: 5 }, () => dodajUplatu(prisma, A, id, uplata("2026-09-25", 1000), SADA)));
    expect((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id } })).placeno.toFixed(2)).toBe("50.00");
  });
});
