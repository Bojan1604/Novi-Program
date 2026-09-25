import { describe, expect, it } from "vitest";
import { izbornikZa, prvaDopustena } from "@/domain/izbornik";
import { ZADANE_ULOGE } from "@/domain/prava";
import { AKCIJE, STRANICE, zadovoljava, type KljucAkcije, type PutanjaStranice } from "./akcije-prava";
import { IZBORNIK } from "./izbornik";

const pravaUloge = (naziv: string) => ZADANE_ULOGE.find((u) => u.naziv === naziv)!.prava;

const SVI = ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser", "Knjigovođa"];

/**
 * Očekivanja napisana RUČNO (ne izračunata istom funkcijom): koje uloge smiju koju akciju.
 * Nova akcija ili stranica mora se dodati ovdje, inače test pukne.
 */
const TKO_SMIJE_AKCIJU: Record<KljucAkcije, string[]> = {
  "racun.lozinka": SVI,
  "korisnici.dodaj": ["Administrator"],
  "korisnici.uredi": ["Administrator"],
  "korisnici.lozinka": ["Administrator"],
  "uloge.spremi": ["Administrator"],
  "uloge.obrisi": ["Administrator"],
  "sifrarnici.spremi": ["Administrator", "Voditelj"],
  "sifrarnici.aktivnost": ["Administrator", "Voditelj"],
  "sifrarnici.obrisi": ["Administrator"],
  "partneri.spremi": ["Administrator", "Voditelj", "Prodavač"],
  "partneri.aktivnost": ["Administrator", "Voditelj", "Prodavač"],
  "partneri.obrisi": ["Administrator", "Voditelj"],
  "partneri.dohvat": ["Administrator", "Voditelj", "Prodavač"],
  "partneri.vies": ["Administrator", "Voditelj", "Prodavač"],
  "poslovnice.spremi": ["Administrator", "Voditelj", "Prodavač"],
  "cjenici.spremi": ["Administrator", "Voditelj", "Prodavač"],
  "cjenici.stavka": ["Administrator", "Voditelj", "Prodavač"],
  "primke.zaprimi": ["Administrator", "Voditelj", "Skladištar"],
  "primke.provjera": ["Administrator", "Voditelj", "Skladištar"],
  "primke.storno": ["Administrator", "Voditelj"],
};

const TKO_VIDI_STRANICU: Record<PutanjaStranice, string[]> = {
  "/": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "/korisnici": ["Administrator", "Voditelj"],
  "/uloge": ["Administrator", "Voditelj"],
  "/dnevnik": ["Administrator", "Voditelj"],
  "/sifrarnici": ["Administrator", "Voditelj", "Prodavač", "Skladištar"],
  "/moj-racun": SVI,
  "/partneri": SVI,
  "/cjenici": SVI,
  "/primke": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "/uredaji": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
};

describe("svaka uloga × svaka akcija", () => {
  it("očekivanja pokrivaju sve akcije i stranice, a uloge su sve zadane uloge", () => {
    expect(Object.keys(TKO_SMIJE_AKCIJU).sort()).toEqual(Object.keys(AKCIJE).sort());
    expect(Object.keys(TKO_VIDI_STRANICU).sort()).toEqual(Object.keys(STRANICE).sort());
    expect([...SVI].sort()).toEqual(ZADANE_ULOGE.map((u) => u.naziv).sort());
  });

  for (const uloga of ZADANE_ULOGE) {
    for (const kljuc of Object.keys(AKCIJE) as KljucAkcije[]) {
      const ocekivano = TKO_SMIJE_AKCIJU[kljuc].includes(uloga.naziv);
      it(`${uloga.naziv} · ${kljuc} → ${ocekivano ? "dopušteno" : "zabranjeno"}`, () => {
        expect(zadovoljava(uloga.prava, AKCIJE[kljuc])).toBe(ocekivano);
      });
    }
    for (const putanja of Object.keys(STRANICE) as PutanjaStranice[]) {
      const ocekivano = TKO_VIDI_STRANICU[putanja].includes(uloga.naziv);
      it(`${uloga.naziv} · stranica ${putanja} → ${ocekivano ? "dopušteno" : "zabranjeno"}`, () => {
        const { naziv: _n, ...pravo } = STRANICE[putanja];
        expect(zadovoljava(uloga.prava, pravo)).toBe(ocekivano);
      });
    }
  }
});

describe("posebna prava u akcijama", () => {
  it("akcija koja traži posebno pravo odbija bez njega", () => {
    expect(zadovoljava(pravaUloge("Prodavač"), { posebno: "costs" })).toBe(false);
    expect(zadovoljava(pravaUloge("Knjigovođa"), { posebno: "costs" })).toBe(true);
    expect(zadovoljava(pravaUloge("Voditelj"), { modul: "prodaja", razina: "pregled", posebno: "opasnaZona" })).toBe(false);
  });
});

describe("izbornik", () => {
  it("prikazuje samo dopušteno; prva stranica je prva dopuštena", () => {
    const putanje = (uloga: string) => izbornikZa(pravaUloge(uloga), IZBORNIK).map((s) => s.putanja);
    expect(putanje("Prodavač")).toEqual(["/", "/partneri", "/cjenici", "/uredaji", "/primke", "/sifrarnici", "/moj-racun"]);
    expect(putanje("Administrator")).toEqual([
      "/",
      "/partneri",
      "/cjenici",
      "/uredaji",
      "/primke",
      "/sifrarnici",
      "/korisnici",
      "/uloge",
      "/dnevnik",
      "/moj-racun",
    ]);
    expect(prvaDopustena(pravaUloge("Knjigovođa"), IZBORNIK)).toBe("/partneri");
  });

  it("svaka stranica iz popisa je u izborniku", () => {
    expect(IZBORNIK.map((s) => s.putanja).sort()).toEqual(Object.keys(STRANICE).sort());
  });
});
