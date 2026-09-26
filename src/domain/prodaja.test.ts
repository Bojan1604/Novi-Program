import { describe, expect, it } from "vitest";
import { izracunajDokument, PRETVORBE, provjeriStavku, vrstaIsporuke, type UlaznaStavka } from "./prodaja";
import { TEKSTOVI_OSLOBODJENJA } from "./pdv";

const st = (x: Partial<UlaznaStavka>): UlaznaStavka => ({
  vrsta: "MODEL",
  namjena: "PRODAJA",
  modelId: "m",
  naziv: "Laptop",
  jedinica: "kom",
  kolicina: 1000,
  cijena: 100000,
  popust: 0,
  stopa: 2500,
  ...x,
});
const domaci = { firmaUSustavuPdv: true, pdvPoNaplacenoj: false, statusKupca: "DOMACI" as const, popust: 0 };

describe("stavke", () => {
  it("vrsta isporuke: prodaja uređaja roba, najam i usluga usluga, ručna po izboru", () => {
    expect(vrstaIsporuke(st({}))).toBe("ROBA");
    expect(vrstaIsporuke(st({ namjena: "NAJAM" }))).toBe("USLUGA");
    expect(vrstaIsporuke(st({ vrsta: "USLUGA" }))).toBe("USLUGA");
    expect(vrstaIsporuke(st({ vrsta: "RUCNA", vrstaIsporuke: "USLUGA" }))).toBe("USLUGA");
    expect(vrstaIsporuke(st({ vrsta: "RUCNA" }))).toBe("ROBA");
  });
  it("provjera", () => {
    expect(provjeriStavku(st({}), 0)).toBeNull();
    expect(provjeriStavku(st({ naziv: " " }), 0)).toBe("Stavka 1: upišite naziv.");
    expect(provjeriStavku(st({ kolicina: 0 }), 1)).toBe("Stavka 2: količina mora biti veća od 0.");
    expect(provjeriStavku(st({ kolicina: -1000 }), 0)).not.toBeNull();
    expect(provjeriStavku(st({ kolicina: -1000 }), 0, true)).toBeNull();
    expect(provjeriStavku(st({ vrsta: "UREDAJ", uredajId: "u", kolicina: 2000 }), 0)).toContain("količinu 1");
    expect(provjeriStavku(st({ vrsta: "UREDAJ", uredajId: null }), 0)).toContain("odaberite uređaj");
    expect(provjeriStavku(st({ stopa: 1700 }), 0)).toContain("stopa PDV-a");
    expect(provjeriStavku(st({ popust: 10001 }), 0)).toContain("popust");
    expect(provjeriStavku(st({ cijena: -1 }), 0)).toContain("cijena");
  });
});

describe("izračun dokumenta", () => {
  it("domaći kupac: laptop 1.000,00 + najam 50,00 + usluga 2 h × 40,00, popust dokumenta 10 %", () => {
    const r = izracunajDokument(
      [
        st({}),
        st({ namjena: "NAJAM", cijena: 5000 }),
        st({ vrsta: "USLUGA", uslugaId: "u", modelId: null, kolicina: 2000, cijena: 4000, jedinica: "h" }),
      ],
      { ...domaci, popust: 1000 },
    );
    // 900,00 + 45,00 + 72,00 = 1.017,00; PDV 254,25
    expect(r.zbrojevi).toMatchObject({ osnovica: 101700, pdv: 25425, ukupno: 127125 });
    expect(r.stavke.map((s) => s.iznos)).toEqual([90000, 4500, 7200]);
    expect(r.napomene).toEqual([]);
  });
  it("EU obveznik: laptop oslobođen (K), najam prijenos obveze (AE), obje napomene", () => {
    const r = izracunajDokument([st({}), st({ namjena: "NAJAM", cijena: 5000 })], { ...domaci, statusKupca: "EU_OBVEZNIK" });
    expect(r.stavke.map((s) => s.kategorija.ublKod)).toEqual(["K", "AE"]);
    expect(r.zbrojevi).toMatchObject({ osnovica: 105000, pdv: 0, ukupno: 105000 });
    expect(r.napomene).toEqual([TEKSTOVI_OSLOBODJENJA.EU_ROBA, TEKSTOVI_OSLOBODJENJA.EU_USLUGA]);
  });
  it("firma izvan sustava PDV-a", () => {
    expect(izracunajDokument([st({})], { ...domaci, firmaUSustavuPdv: false }).zbrojevi.pdv).toBe(0);
  });
  it("pretvorbe", () => {
    expect(PRETVORBE.PONUDA).toEqual(["PREDRACUN", "RACUN"]);
    expect(PRETVORBE.RACUN).toEqual([]);
  });
});

describe("količina", () => {
  it("čitanje i prikaz", async () => {
    const { procitajKolicinu, formatirajKolicinu } = await import("./prodaja");
    expect(procitajKolicinu("2")).toEqual({ ok: true, vrijednost: 2000 });
    expect(procitajKolicinu("1,5")).toEqual({ ok: true, vrijednost: 1500 });
    expect(procitajKolicinu("0,333")).toEqual({ ok: true, vrijednost: 333 });
    expect(procitajKolicinu("-1")).toEqual({ ok: true, vrijednost: -1000 });
    expect(procitajKolicinu("1,2345").ok).toBe(false);
    expect(procitajKolicinu("abc").ok).toBe(false);
    expect(procitajKolicinu("1.5").ok).toBe(false);
    expect(formatirajKolicinu(1500)).toBe("1,5");
    expect(formatirajKolicinu(2000)).toBe("2");
    expect(formatirajKolicinu(333)).toBe("0,333");
    expect(formatirajKolicinu(-1000)).toBe("-1");
  });
});

describe("isti model = jedna stavka", () => {
  it("uređaji istog modela i cijene spojeni s količinom i serijskim brojevima; različita cijena ostaje zasebno", async () => {
    const { grupirajUredaje, izracunajDokument } = await import("./prodaja");
    const u = (id: string, sn: string, cijena = 100000) => st({ vrsta: "UREDAJ", uredajId: id, serijskiBroj: sn, cijena, kpd: "26.20.11" } as never);
    const g = grupirajUredaje([
      u("a", "SN2"),
      st({ vrsta: "USLUGA", uslugaId: "x", naziv: "Dostava", cijena: 1000 }),
      u("b", "SN1"),
      u("c", "SN3", 90000),
    ]);
    expect(g.map((x) => [x.naziv, x.kolicina, x.uredajIds, x.opis ?? null])).toEqual([
      ["Laptop", 2000, ["a", "b"], "S/N: SN1, SN2"],
      ["Dostava", 1000, [], null],
      ["Laptop", 1000, ["c"], "S/N: SN3"],
    ]);
    // zbroj na grupiranim: 3 × 333,33 = 999,99 kao jedna stavka
    const r = izracunajDokument([u("a", "A", 33333), u("b", "B", 33333), u("c", "C", 33333)], domaci);
    expect(r.grupirane).toHaveLength(1);
    expect(r.zbrojevi.osnovica).toBe(99999);
    expect(r.stavke.map((s) => s.iznos)).toEqual([33333, 33333, 33333]);
  });
  it("KPD obavezan za izdavanje", async () => {
    const { provjeriZaIzdavanje } = await import("./prodaja");
    expect(provjeriZaIzdavanje([{ naziv: "A", kpd: "26.20.11" }])).toBeNull();
    expect(
      provjeriZaIzdavanje([
        { naziv: "A", kpd: "26.20.11" },
        { naziv: "Dostava", kpd: null },
      ]),
    ).toContain("2. Dostava");
  });
});
