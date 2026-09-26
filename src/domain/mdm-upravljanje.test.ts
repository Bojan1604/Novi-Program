import { describe, expect, it } from "vitest";
import {
  instaliraneIzIzvjestaja,
  lanacOrganizacija,
  potrebneInstalacije,
  procitajPostavke,
  provjeriNaredbu,
  vazeciProfil,
  zeljeneAplikacije,
} from "./mdm-upravljanje";

const A = "00000000-0000-7000-8000-000000000001";

describe("MDM naredbe", () => {
  it("platforma i parametri", () => {
    expect(provjeriNaredbu("ZAKLJUCAJ", "ANDROID", {})).toEqual({ ok: true, vrsta: "ZAKLJUCAJ", parametri: {} });
    expect(provjeriNaredbu("SNIMI_ZASLON", "ANDROID", {})).toMatchObject({ ok: false, greska: expect.stringMatching(/Androidu/) });
    expect(provjeriNaredbu("NESTO", "WINDOWS", {})).toMatchObject({ ok: false });
    expect(provjeriNaredbu("PORUKA", "WINDOWS", { tekst: "  " })).toMatchObject({ ok: false });
    expect(provjeriNaredbu("PORUKA", "WINDOWS", { tekst: " Vratite uređaj " })).toEqual({
      ok: true,
      vrsta: "PORUKA",
      parametri: { tekst: "Vratite uređaj" },
    });
    expect(provjeriNaredbu("INSTALIRAJ", "ANDROID", { aplikacijaId: "x" })).toMatchObject({ ok: false });
    expect(provjeriNaredbu("INSTALIRAJ", "ANDROID", { aplikacijaId: A })).toMatchObject({ ok: true, parametri: { aplikacijaId: A } });
    expect(provjeriNaredbu("DEINSTALIRAJ", "ANDROID", { paket: "com.primjer.app" })).toMatchObject({ ok: true });
    expect(provjeriNaredbu("DEINSTALIRAJ", "ANDROID", { paket: "a b" })).toMatchObject({ ok: false });
  });
});

describe("MDM profili", () => {
  it("postavke: granice i zadano", () => {
    expect(procitajPostavke({})).toEqual({
      ok: true,
      vrijednost: { lozinkaMin: null, zakljucajNakonMin: null, kameraDopustena: true, usbDopusten: true, wifiSsid: null, kiosk: null },
    });
    expect(procitajPostavke({ lozinkaMin: "3" })).toMatchObject({ ok: false });
    expect(procitajPostavke({ zakljucajNakonMin: 61 })).toMatchObject({ ok: false });
    expect(procitajPostavke({ lozinkaMin: "6", kameraDopustena: false, wifiSsid: " Ured ", kiosk: "com.firma.kiosk" })).toMatchObject({
      ok: true,
      vrijednost: { lozinkaMin: 6, kameraDopustena: false, wifiSsid: "Ured", kiosk: "com.firma.kiosk" },
    });
  });

  it("važeći profil: najbliža organizacija, pa opći; samo aktivni i ista platforma", () => {
    const p = [
      { id: "opci", organizacijaId: null, platforma: "ANDROID", aktivan: true },
      { id: "d", organizacijaId: "d1", platforma: "ANDROID", aktivan: true },
      { id: "k", organizacijaId: "k1", platforma: "ANDROID", aktivan: false },
      { id: "w", organizacijaId: "k1", platforma: "WINDOWS", aktivan: true },
    ];
    expect(vazeciProfil(p, ["k1", "d1"], "ANDROID")?.id).toBe("d");
    expect(vazeciProfil(p, ["k2"], "ANDROID")?.id).toBe("opci");
    expect(vazeciProfil(p, ["k1", "d1"], "WINDOWS")?.id).toBe("w");
    expect(vazeciProfil(p, ["x"], "WINDOWS")).toBeNull();
  });
});

describe("MDM aplikacije: nova verzija stiže na uređaje", () => {
  const apl = [
    { id: "a1", paket: "com.firma.app", platforma: "ANDROID", verzijaKod: 1 },
    { id: "a2", paket: "com.firma.app", platforma: "ANDROID", verzijaKod: 2 },
    { id: "b1", paket: "com.drugo", platforma: "ANDROID", verzijaKod: 5 },
    { id: "w1", paket: "com.firma.app", platforma: "WINDOWS", verzijaKod: 9 },
  ];
  const dodjele = [
    { organizacijaId: "d1", paket: "com.firma.app", platforma: "ANDROID" },
    { organizacijaId: "k9", paket: "com.drugo", platforma: "ANDROID" },
  ];
  it("dodjela na distributera vrijedi za klijente ispod; uvijek najnovija verzija", () => {
    expect(zeljeneAplikacije(dodjele, apl, ["k1", "d1"], "ANDROID").map((a) => a.id)).toEqual(["a2"]);
    expect(zeljeneAplikacije(dodjele, apl, ["k1", "d1"], "WINDOWS")).toEqual([]);
  });
  it("instalira se kad nema ili je starija, i nikad dvaput dok čeka", () => {
    const z = zeljeneAplikacije(dodjele, apl, ["d1"], "ANDROID");
    expect(potrebneInstalacije(z, new Map(), new Set()).map((a) => a.id)).toEqual(["a2"]);
    expect(potrebneInstalacije(z, new Map([["com.firma.app", 1]]), new Set()).map((a) => a.id)).toEqual(["a2"]);
    expect(potrebneInstalacije(z, new Map([["com.firma.app", 2]]), new Set())).toEqual([]);
    expect(potrebneInstalacije(z, new Map([["com.firma.app", 1]]), new Set(["a2"]))).toEqual([]);
  });
  it("izvještaj agenta: preskače neispravno", () => {
    expect([
      ...instaliraneIzIzvjestaja({ aplikacije: [{ paket: "a", verzijaKod: 3 }, { paket: 5 }, null, { paket: "b", verzijaKod: "2" }] }),
    ]).toEqual([["a", 3]]);
    expect(instaliraneIzIzvjestaja(null).size).toBe(0);
  });
  it("lanac organizacija bez petlji", () => {
    const o = [
      { id: "k1", nadredenaId: "d1" },
      { id: "d1", nadredenaId: null },
      { id: "x", nadredenaId: "y" },
      { id: "y", nadredenaId: "x" },
    ];
    expect(lanacOrganizacija(o, "k1")).toEqual(["k1", "d1"]);
    expect(lanacOrganizacija(o, "x")).toEqual(["x", "y"]);
  });
});
