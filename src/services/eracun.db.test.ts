import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kontrolnaZnamenkaOib } from "@/domain/oib";
import type { UlaznaStavka } from "@/domain/prodaja";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { osvjeziStatusERacuna, posaljiERacun, posaljiIzvjestaje, ublRacuna } from "./eracun";
import { pravaClana, type Akter } from "./korisnici";
import { dodajPredujam, izdajRacun, napraviOdobrenje, spremiNacrt, stornirajRacun, type UlazDokumenta } from "./prodaja";
import { napraviZadaneSifrarnike } from "./sifrarnici";
import { dodajUplatu, ponistiUplatu } from "./uplate";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const SADA = new Date("2026-09-25T10:00:00Z");
const stavka = (x: Partial<UlaznaStavka> = {}): UlaznaStavka => ({
  vrsta: "RUCNA",
  namjena: "PRODAJA",
  naziv: "Laptop",
  kpd: "26.20.11",
  jedinica: "kom",
  kolicina: 1000,
  cijena: 100000,
  popust: 0,
  stopa: 2500,
  ...x,
});
const oib = (p: string) => `${p}${kontrolnaZnamenkaOib(p)}`;

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  await prisma.firma.update({
    where: { id: firma.id },
    data: { iban: "HR1210010051863000160", adresa: "Ilica 1", postanskiBroj: "10000", mjesto: "Zagreb" },
  });
  await napraviZadaneSifrarnike(prisma, firma.id);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj", ime: "Vesna" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const skl = await prisma.skladiste.findFirstOrThrow({ where: { firmaId: firma.id } });
  const kupac = await prisma.partner.create({
    data: { firmaId: firma.id, naziv: "Kupac d.o.o.", oib: oib("1234567890"), adresa: "Vukovarska 2", postanskiBroj: "21000", mjesto: "Split" },
  });
  const ulaz = (x: Partial<UlazDokumenta>): UlazDokumenta => ({
    vrsta: "RACUN",
    verzija: 0,
    partnerId: kupac.id,
    poslovnicaId: null,
    datum: "2026-09-25",
    vrijediDo: null,
    dospijece: "2026-10-10",
    popust: 0,
    napomena: null,
    stavke: [stavka()],
    ...x,
  });
  const izdaj = async (x: Partial<UlazDokumenta>) => {
    const n = await spremiNacrt(prisma, A, null, ulaz(x));
    await izdajRacun(prisma, A, n.id, SADA);
    return n.id;
  };
  return { firma, A, kupac, skl, ulaz, izdaj };
}

describe("UBL svih vrsta dokumenata prolazi provjeru (HR CIUS)", () => {
  it("račun (popusti, dvije stope, usluga u satima), predujam, konačni s odbitkom, odobrenje, storno", async () => {
    const { A, skl, ulaz, izdaj, firma } = await pripremi();
    const racun = await izdaj({
      popust: 500,
      napomena: "Hvala!",
      stavke: [
        stavka({ kolicina: 3000, cijena: 33333, popust: 1250 }),
        stavka({ naziv: "Servis", kpd: "95.11.10", jedinica: "h", kolicina: 1500, cijena: 4000, stopa: 1300 }),
      ],
    });
    const r = await ublRacuna(prisma, firma.id, racun);
    expect(r.greske).toEqual([]);
    expect(r.xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
    expect(r.xml).toContain('unitCode="HUR">1.5</cbc:InvoicedQuantity>');
    expect(r.xml).toContain("<cbc:Note>Hvala!</cbc:Note>");
    expect(r.xml).toContain('mimeCode="application/pdf"');
    expect(r.xml).toContain(`<cbc:ID>${firma.oib}</cbc:ID><cbc:Name>Vesna</cbc:Name>`);

    const pred = await izdaj({ vrsta: "PREDUJAM", stavke: [stavka({ cijena: 40000 })] });
    const p = await ublRacuna(prisma, firma.id, pred);
    expect(p.greske).toEqual([]);
    expect(p.xml).toContain("<cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>");

    const kon = await spremiNacrt(prisma, A, null, ulaz({}));
    await dodajPredujam(prisma, A, kon.id, pred);
    await izdajRacun(prisma, A, kon.id, SADA);
    const kx = await ublRacuna(prisma, firma.id, kon.id);
    expect(kx.greske).toEqual([]);
    expect(kx.xml).toContain('<cbc:PayableAmount currencyID="EUR">750.00</cbc:PayableAmount>');

    const od = await napraviOdobrenje(prisma, A, racun, SADA);
    const odStavke = await prisma.stavkaProdajnogDokumenta.findMany({ where: { dokumentId: od.id }, orderBy: { redoslijed: "asc" } });
    await prisma.stavkaProdajnogDokumenta.delete({ where: { id: odStavke[1]!.id } });
    await izdajRacun(prisma, A, od.id, SADA);
    const ox = await ublRacuna(prisma, firma.id, od.id);
    expect(ox.greske).toEqual([]);
    expect(ox.xml).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(ox.xml).toMatch(/<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>\d+\/PP1\/1<\/cbc:ID>/);

    const drugi = await izdaj({});
    const st = await stornirajRacun(prisma, A, drugi, skl.id, SADA);
    const sx = await ublRacuna(prisma, firma.id, st.id);
    expect(sx.greske).toEqual([]);
    expect(sx.xml).toContain('<cbc:PayableAmount currencyID="EUR">1250.00</cbc:PayableAmount>');
  });

  it("firma izvan sustava PDV-a: kategorija O, bez PDV broja", async () => {
    const { izdaj, firma } = await pripremi();
    await prisma.firma.update({ where: { id: firma.id }, data: { uSustavuPdv: false } });
    const r = await ublRacuna(prisma, firma.id, await izdaj({}));
    expect(r.greske).toEqual([]);
    expect(r.xml).toContain("<cbc:ID>O</cbc:ID>");
    expect(r.xml).not.toContain(`HR${firma.oib}`);
  });

  it("nacrt i ponuda nemaju eRačun; bez IBAN-a plaćanje na račun ne prolazi provjeru", async () => {
    const { A, ulaz, izdaj, firma } = await pripremi();
    const n = await spremiNacrt(prisma, A, null, ulaz({}));
    await expect(ublRacuna(prisma, firma.id, n.id)).rejects.toThrow("samo za izdani račun");
    await prisma.firma.update({ where: { id: firma.id }, data: { iban: null } });
    const r = await ublRacuna(prisma, firma.id, await izdaj({}));
    expect(r.greske).toContain("BR-50: za plaćanje na račun nedostaje IBAN.");
    await expect(posaljiERacun(prisma, A, (await prisma.prodajniDokument.findFirstOrThrow({ where: { status: "IZDAN" } })).id)).rejects.toThrow(
      "eRačun nije ispravan: BR-50",
    );
  });
});

describe("slanje, status, AMS, eIzvještavanje (demo posrednik)", () => {
  it("šalje se jednom; kupac upisan u AMS; status prihvaćen; uplata → izvještaj o naplati; poništena poslana uplata → ispravak", async () => {
    const { A, izdaj, kupac, firma } = await pripremi();
    const id = await izdaj({});
    // uplata prije slanja ulazi u izvještaje tek kad se eRačun pošalje
    await dodajUplatu(prisma, A, id, { datum: "2026-09-25", iznos: 50000, nacin: "T", opis: null }, SADA);
    expect(await prisma.eIzvjestaj.count()).toBe(0);
    expect(await posaljiERacun(prisma, A, id, SADA)).toEqual({ status: "POSLAN" });
    const p = await prisma.partner.findUniqueOrThrow({ where: { id: kupac.id } });
    expect(p).toMatchObject({ eRacunAktivan: true, eRacunAdresa: `9934:${kupac.oib}` });
    await expect(posaljiERacun(prisma, A, id, SADA)).rejects.toThrow("već poslan");
    const e = await prisma.eRacun.findFirstOrThrow({ where: { dokumentId: id } });
    expect(e.xml).toContain("<Invoice ");
    expect(e.posrednikId).toMatch(/^DEMO-/);
    expect(await osvjeziStatusERacuna(prisma, A, id, SADA)).toBe("PRIHVACEN");
    expect(await prisma.dnevnik.count({ where: { firmaId: firma.id, radnja: { in: ["eracun.posalji", "eracun.status"] } } })).toBe(2);

    await dodajUplatu(prisma, A, id, { datum: "2026-09-25", iznos: 75000, nacin: "T", opis: null }, SADA);
    const iz = await prisma.eIzvjestaj.findMany({ orderBy: { iznos: "asc" } });
    expect(iz.map((i) => [i.vrsta, i.iznos.toFixed(2), i.status])).toEqual([
      ["NAPLATA", "500.00", "CEKA"],
      ["NAPLATA", "750.00", "CEKA"],
    ]);
    // neposlani izvještaj poništene uplate se briše
    await ponistiUplatu(prisma, A, iz[1]!.uplataId!, "krivi iznos");
    expect(await prisma.eIzvjestaj.count()).toBe(1);
    expect(await posaljiIzvjestaje(prisma, firma.id, SADA)).toEqual({ poslano: 1, greske: 0 });
    // poslani: ispravak s minusom, koji se također šalje
    await ponistiUplatu(prisma, A, iz[0]!.uplataId!, "vraćeno");
    const ispravak = await prisma.eIzvjestaj.findFirstOrThrow({ where: { status: "CEKA" } });
    expect(ispravak.iznos.toFixed(2)).toBe("-500.00");
    expect(await posaljiIzvjestaje(prisma, null, SADA)).toEqual({ poslano: 1, greske: 0 });
  });

  it("kupac nije u AMS-u → ne šalje se, AMS status zapisan; strani kupac → ne šalje se", async () => {
    const { A, izdaj, kupac, firma } = await pripremi();
    await prisma.partner.update({ where: { id: kupac.id }, data: { oib: oib("0234567890") } });
    const id = await izdaj({});
    await expect(posaljiERacun(prisma, A, id, SADA)).rejects.toThrow("nije u adresaru eRačuna");
    expect((await prisma.partner.findUniqueOrThrow({ where: { id: kupac.id } })).eRacunAktivan).toBe(false);
    expect(await prisma.eRacun.count()).toBe(0);

    const strani = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "GmbH", drzava: "DE", pdvBroj: "DE123456789" } });
    const id2 = await izdaj({ partnerId: strani.id });
    await expect(posaljiERacun(prisma, A, id2, SADA)).rejects.toThrow("hrvatskom kupcu");
  });

  it("druga firma ne vidi ni ne šalje tuđi račun", async () => {
    const { izdaj } = await pripremi();
    const id = await izdaj({});
    const druga = await napraviFirmu(prisma);
    const k2 = await napraviKorisnika(prisma, druga.id, { uloga: "Administrator" });
    const B: Akter = { firmaId: druga.id, korisnikId: k2.id, prava: (await pravaClana(prisma, druga.id, k2.id))! };
    await expect(posaljiERacun(prisma, B, id, SADA)).rejects.toThrow("Račun ne postoji.");
    await expect(ublRacuna(prisma, druga.id, id)).rejects.toThrow("Račun ne postoji.");
  });
});
