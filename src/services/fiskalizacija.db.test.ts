import { createVerify, createHash } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ulazZki } from "@/domain/fiskalizacija";
import type { UlaznaStavka } from "@/domain/prodaja";
import { demoCertifikat, demoP12 } from "@/lib/fiskalizacija/certifikat";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { dostaviNaknadno, fiskaliziraj } from "./fiskalizacija";
import { pravaClana, type Akter } from "./korisnici";
import { spremiFiskalizaciju } from "./postavke";
import { izdajRacun, spremiNacrt, stornirajRacun, type UlazDokumenta } from "./prodaja";
import { napraviZadaneSifrarnike } from "./sifrarnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));
afterEach(() => vi.unstubAllGlobals());

const SADA = new Date("2026-09-25T10:00:00Z");

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Administrator", ime: "Ana" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Kupac d.o.o.", oib: "69435151530" } });
  const usluga: UlaznaStavka = {
    vrsta: "RUCNA",
    namjena: "PRODAJA",
    naziv: "Servis",
    kpd: "95.11.10",
    jedinica: "h",
    kolicina: 2000,
    cijena: 5000,
    popust: 0,
    stopa: 2500,
  };
  const racun = async (x: Partial<UlazDokumenta>, sada = SADA) => {
    const n = await spremiNacrt(prisma, A, null, {
      vrsta: "RACUN",
      verzija: 0,
      partnerId: kupac.id,
      poslovnicaId: null,
      datum: "2026-09-25",
      vrijediDo: null,
      dospijece: "2026-09-25",
      popust: 0,
      napomena: null,
      stavke: [usluga],
      ...x,
    });
    const r = await izdajRacun(prisma, A, n.id, sada);
    return { id: n.id, ...r, dok: await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: n.id } }) };
  };
  return { firma, A, k, kupac, skl, racun };
}

describe("fiskalizacija pri izdavanju računa", () => {
  it("transakcijski račun poslovnom subjektu se ne fiskalizira (ide kao eRačun)", async () => {
    const { racun } = await pripremi();
    const r = await racun({ nacinPlacanja: "T" });
    expect(r.dok.fiskalStatus).toBe("NIJE_POTREBNO");
    expect(r.dok.zki).toBeNull();
    expect(r.fiskal).toBeNull();
  });

  it("demo: gotovina → ZKI potpisan demo certifikatom i izmišljeni JIR; OIB operatera je OIB firme dok korisnik nema svoj", async () => {
    const { racun, firma } = await pripremi();
    const r = await racun({ nacinPlacanja: "G" });
    expect(r.fiskal).toBe("Fiskaliziran.");
    expect(r.dok.fiskalStatus).toBe("FISKALIZIRAN");
    expect(r.dok.zki).toMatch(/^[0-9a-f]{32}$/);
    expect(r.dok.jir).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.dok.oibOperatera).toBe(firma.oib);
    // ZKI = MD5(RSA-SHA1 potpis ulaza) — potpis je deterministički (PKCS#1 v1.5), pa se provjerava ponovnim izračunom
    const ulaz = ulazZki({ oib: firma.oib, vrijeme: SADA, redni: r.dok.redni!, prostor: "PP1", uredaj: "1", ukupno: 12500 });
    expect(ulaz).toBe(`${firma.oib}25.09.2026 12:00:00${r.dok.redni}PP11125.00`);
    const potpis = (await import("node:crypto")).createSign("RSA-SHA1").update(ulaz).sign(demoCertifikat().kljucPem);
    expect(createVerify("RSA-SHA1").update(ulaz).verify(demoCertifikat().certPem, potpis)).toBe(true);
    expect(createHash("md5").update(potpis).digest("hex")).toBe(r.dok.zki);
  });

  it("račun građaninu (kupac bez OIB-a) fiskalizira se i kad je plaćen na račun; OIB operatera iz korisnika", async () => {
    const { racun, k } = await pripremi();
    await prisma.korisnik.update({ where: { id: k.id }, data: { oib: "94577403194" } });
    const r = await racun({ partnerId: null, nacinPlacanja: "T" });
    expect(r.dok.fiskalStatus).toBe("FISKALIZIRAN");
    expect(r.dok.oibOperatera).toBe("94577403194");
  });

  it("isključena fiskalizacija: ništa se ne računa", async () => {
    const { racun, firma } = await pripremi();
    await prisma.firma.update({ where: { id: firma.id }, data: { fiskalNacin: "ISKLJUCENA" } });
    const r = await racun({ nacinPlacanja: "G" });
    expect(r.dok.fiskalStatus).toBe("NIJE_POTREBNO");
  });

  it("testni CIS ne odgovara → račun je izdan, čeka naknadnu dostavu; sljedeći krug šalje s NakDost=true i sprema JIR", async () => {
    const { racun, A } = await pripremi();
    expect(await spremiFiskalizaciju(prisma, A, { nacin: "TEST", certifikat: { sadrzaj: demoP12("tajna"), lozinka: "tajna" } })).toEqual({});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ETIMEDOUT");
      }),
    );
    const r = await racun({ nacinPlacanja: "K" });
    expect(r.dok.status).toBe("IZDAN");
    expect(r.dok.broj).toBeTruthy();
    expect(r.fiskal).toContain("ponovit će se automatski");
    const c = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: r.id } });
    expect(c).toMatchObject({ fiskalStatus: "CEKA", fiskalPokusaja: 1, jir: null });
    expect(c.fiskalGreska).toContain("ETIMEDOUT");
    expect(c.fiskalSljedeci!.getTime()).toBe(SADA.getTime() + 60_000);

    // prerano: ništa se ne šalje
    const posalji = vi.fn(async (_u: string, o: { body: string }) => {
      expect(o.body).toContain("<tns:NakDost>true</tns:NakDost>");
      expect(o.body).toContain("<tns:NacinPlac>K</tns:NacinPlac>");
      expect(o.body).toContain("<tns:IznosUkupno>125.00</tns:IznosUkupno>");
      expect(o.body).toContain("<tns:Stopa>25.00</tns:Stopa><tns:Osnovica>100.00</tns:Osnovica><tns:Iznos>25.00</tns:Iznos>");
      expect(o.body).toContain("<SignatureValue>");
      return new Response(
        `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><tns:RacunOdgovor xmlns:tns="http://www.apis-it.hr/fin/2012/types/f73"><tns:Jir>a1b2c3d4-0000-4000-8000-000000000001</tns:Jir></tns:RacunOdgovor></soap:Body></soap:Envelope>`,
      );
    });
    vi.stubGlobal("fetch", posalji);
    expect(await dostaviNaknadno(prisma, new Date(SADA.getTime() + 30_000))).toBe(0);
    expect(await dostaviNaknadno(prisma, new Date(SADA.getTime() + 61_000))).toBe(1);
    expect(posalji).toHaveBeenCalledOnce();
    expect(posalji.mock.calls[0]![0]).toBe("https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest");
    const d = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: r.id } });
    expect(d).toMatchObject({ fiskalStatus: "FISKALIZIRAN", jir: "a1b2c3d4-0000-4000-8000-000000000001", fiskalGreska: null, zki: c.zki });
    // već fiskaliziran se ne šalje ponovno
    expect("greska" in (await fiskaliziraj(prisma, A.firmaId, r.id))).toBe(true);
  });

  it("CIS vrati grešku → pamti se šifra i poruka, pokušaj se odgađa", async () => {
    const { racun, A } = await pripremi();
    await spremiFiskalizaciju(prisma, A, { nacin: "TEST", certifikat: { sadrzaj: demoP12("x"), lozinka: "x" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            `<Envelope><Body><RacunOdgovor><Greske><Greska><SifraGreske>s004</SifraGreske><PorukaGreske>Neispravan digitalni certifikat.</PorukaGreske></Greska></Greske></RacunOdgovor></Body></Envelope>`,
          ),
      ),
    );
    const r = await racun({ nacinPlacanja: "G" });
    const d = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: r.id } });
    expect(d.fiskalStatus).toBe("CEKA");
    expect(d.fiskalGreska).toBe("s004: Neispravan digitalni certifikat.");
  });

  it("storno fiskaliziranog računa fiskalizira se s negativnim iznosom", async () => {
    const { racun, A, skl } = await pripremi();
    const r = await racun({ nacinPlacanja: "G" });
    const s = await stornirajRacun(prisma, A, r.id, skl.id, new Date(SADA.getTime() + 3600_000));
    expect(s.fiskal).toBe("Fiskaliziran.");
    const d = await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: s.id } });
    expect(d.fiskalStatus).toBe("FISKALIZIRAN");
    expect(d.zki).toMatch(/^[0-9a-f]{32}$/);
    expect(d.zki).not.toBe(r.dok.zki);
    expect(d.ukupno.toFixed(2)).toBe("-125.00");
  });

  it("storno nefiskaliziranog računa se ne fiskalizira", async () => {
    const { racun, A, skl } = await pripremi();
    const r = await racun({ nacinPlacanja: "T" });
    const s = await stornirajRacun(prisma, A, r.id, skl.id, SADA);
    expect(s.fiskal).toBeNull();
    expect((await prisma.prodajniDokument.findUniqueOrThrow({ where: { id: s.id } })).fiskalStatus).toBe("NIJE_POTREBNO");
  });
});

describe("postavke fiskalizacije", () => {
  it("kriva lozinka certifikata → greška polja; test bez certifikata → greška; lozinka nije u dnevniku", async () => {
    const { A, firma } = await pripremi();
    expect(await spremiFiskalizaciju(prisma, A, { nacin: "TEST", certifikat: { sadrzaj: demoP12("dobra"), lozinka: "kriva" } })).toHaveProperty(
      "certifikat",
    );
    await expect(spremiFiskalizaciju(prisma, A, { nacin: "PRODUKCIJA", certifikat: null })).rejects.toThrow("učitajte certifikat");
    expect(await spremiFiskalizaciju(prisma, A, { nacin: "TEST", certifikat: { sadrzaj: demoP12("tajna123"), lozinka: "tajna123" } })).toEqual({});
    const f = await prisma.firma.findUniqueOrThrow({ where: { id: firma.id } });
    expect(f.fiskalNacin).toBe("TEST");
    expect(f.fiskalCertNaziv).toBe("DEMO FISKAL ERP-WMS");
    expect(f.fiskalLozinka).toMatch(/^v1:/);
    expect(f.fiskalLozinka).not.toContain("tajna123");
    const dnevnik = await prisma.dnevnik.findMany({ where: { firmaId: firma.id, radnja: "postavke.fiskalizacija" } });
    expect(dnevnik).toHaveLength(1);
    expect(JSON.stringify(dnevnik)).not.toContain("tajna123");
    expect(JSON.stringify(dnevnik)).not.toContain(f.fiskalCertifikat!.slice(3, 40));
    // promjena načina bez novog certifikata zadržava stari
    expect(await spremiFiskalizaciju(prisma, A, { nacin: "PRODUKCIJA", certifikat: null })).toEqual({});
    expect((await prisma.firma.findUniqueOrThrow({ where: { id: firma.id } })).fiskalCertifikat).toBe(f.fiskalCertifikat);
  });
});
