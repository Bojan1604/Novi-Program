import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { posaljiDokument, zabiljeziMailto } from "./eposta";
import { pravaClana, type Akter } from "./korisnici";
import { izdajRacun, spremiNacrt } from "./prodaja";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));
afterEach(() => {
  delete process.env["EPOSTA_NACIN"];
});

async function racun(izdaj = true) {
  const firma = await napraviFirmu(prisma);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Prodavač", ime: "Petra" });
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
        cijena: 10000,
        popust: 0,
        stopa: 2500,
        vrstaIsporuke: "USLUGA",
      },
    ],
  });
  if (izdaj) await izdajRacun(prisma, A, n.id, new Date("2026-09-25T10:00:00Z"));
  return { A, id: n.id, firma };
}
const poruka = { vrsta: "RACUN", prima: "kupac@primjer.hr", predmet: "Račun 1/PP1/1", tijelo: "Poštovani," };

describe("e-pošta", () => {
  it("slanje s PDF-om (testni prijevoz) i zapis u dnevnik slanja", async () => {
    process.env["EPOSTA_NACIN"] = "test";
    const { A, id } = await racun();
    expect(await posaljiDokument(prisma, A, id, poruka)).toEqual({ poslano: true, greska: null });
    expect(await prisma.slanjeEposte.findFirstOrThrow({ where: { dokumentId: id } })).toMatchObject({
      status: "POSLANO",
      prima: "kupac@primjer.hr",
      korisnik: "Petra",
    });
    expect(await prisma.dnevnik.count({ where: { entitetId: id, radnja: "eposta.slanje" } })).toBe(1);
  });

  it("bez SMTP-a: jasna poruka; mailto se bilježi; nacrt i kriva adresa odbijeni", async () => {
    const { A, id } = await racun();
    await expect(posaljiDokument(prisma, A, id, poruka)).rejects.toThrow("SMTP");
    await zabiljeziMailto(prisma, A, id, poruka);
    expect((await prisma.slanjeEposte.findFirstOrThrow({ where: { dokumentId: id } })).status).toBe("MAILTO");
    await expect(zabiljeziMailto(prisma, A, id, { ...poruka, prima: "nije-adresa" })).rejects.toThrow("nije ispravna");
    process.env["EPOSTA_NACIN"] = "test";
    const nacrt = await racun(false);
    await expect(posaljiDokument(prisma, nacrt.A, nacrt.id, poruka)).rejects.toThrow("Nacrt se ne šalje");
  });

  it("nedostupan poslužitelj pošte: greška zapisana, bez rušenja", async () => {
    const { A, id, firma } = await racun();
    await prisma.firma.update({ where: { id: firma.id }, data: { smtpHost: "127.0.0.1", smtpPort: 1, smtpSigurno: false } });
    const r = await posaljiDokument(prisma, A, id, poruka);
    expect(r.poslano).toBe(false);
    expect(await prisma.slanjeEposte.findFirstOrThrow({ where: { dokumentId: id } })).toMatchObject({ status: "GRESKA" });
  });
});
