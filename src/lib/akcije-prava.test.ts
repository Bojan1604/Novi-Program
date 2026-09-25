import { describe, expect, it } from "vitest";
import { izbornikZa, prvaDopustena } from "@/domain/izbornik";
import { ZADANE_ULOGE } from "@/domain/prava";
import { AKCIJE, STRANICE, zadovoljava, type KljucAkcije, type PutanjaStranice } from "./akcije-prava";
import { IZBORNIK } from "./izbornik";

const pravaUloge = (naziv: string) => ZADANE_ULOGE.find((u) => u.naziv === naziv)!.prava;

/**
 * Očekivanja napisana RUČNO (ne izračunata istom funkcijom): što koja uloga smije.
 * Nova akcija ili stranica mora se dodati ovdje, inače test pukne.
 */
const DOPUSTENE_AKCIJE: Record<string, KljucAkcije[]> = {
  Administrator: [
    "racun.lozinka",
    "korisnici.dodaj",
    "korisnici.uredi",
    "korisnici.lozinka",
    "uloge.spremi",
    "uloge.obrisi",
    "sifrarnici.spremi",
    "sifrarnici.aktivnost",
    "sifrarnici.obrisi",
    "partneri.spremi",
    "partneri.aktivnost",
    "partneri.dohvat",
    "partneri.vies",
    "poslovnice.spremi",
    "cjenici.spremi",
    "cjenici.stavka",
    "partneri.obrisi",
  ],
  Voditelj: [
    "racun.lozinka",
    "sifrarnici.spremi",
    "sifrarnici.aktivnost",
    "partneri.spremi",
    "partneri.aktivnost",
    "partneri.dohvat",
    "partneri.vies",
    "poslovnice.spremi",
    "cjenici.spremi",
    "cjenici.stavka",
    "partneri.obrisi",
  ],
  Prodavač: [
    "racun.lozinka",
    "partneri.spremi",
    "partneri.aktivnost",
    "partneri.dohvat",
    "partneri.vies",
    "poslovnice.spremi",
    "cjenici.spremi",
    "cjenici.stavka",
  ],
  Skladištar: ["racun.lozinka"],
  Serviser: ["racun.lozinka"],
  Knjigovođa: ["racun.lozinka"],
};

const DOPUSTENE_STRANICE: Record<string, PutanjaStranice[]> = {
  Administrator: ["/", "/korisnici", "/uloge", "/dnevnik", "/sifrarnici", "/moj-racun", "/partneri", "/cjenici"],
  Voditelj: ["/", "/korisnici", "/uloge", "/dnevnik", "/sifrarnici", "/moj-racun", "/partneri", "/cjenici"],
  Prodavač: ["/", "/sifrarnici", "/moj-racun", "/partneri", "/cjenici"],
  Skladištar: ["/", "/sifrarnici", "/moj-racun", "/partneri", "/cjenici"],
  Serviser: ["/", "/moj-racun", "/partneri", "/cjenici"],
  Knjigovođa: ["/moj-racun", "/partneri", "/cjenici"],
};

describe("svaka uloga × svaka akcija", () => {
  it("popis očekivanja pokriva sve zadane uloge", () => {
    expect(Object.keys(DOPUSTENE_AKCIJE).sort()).toEqual(ZADANE_ULOGE.map((u) => u.naziv).sort());
    expect(Object.keys(DOPUSTENE_STRANICE).sort()).toEqual(ZADANE_ULOGE.map((u) => u.naziv).sort());
  });

  for (const uloga of ZADANE_ULOGE) {
    for (const kljuc of Object.keys(AKCIJE) as KljucAkcije[]) {
      const ocekivano = DOPUSTENE_AKCIJE[uloga.naziv]!.includes(kljuc);
      it(`${uloga.naziv} · ${kljuc} → ${ocekivano ? "dopušteno" : "zabranjeno"}`, () => {
        expect(zadovoljava(uloga.prava, AKCIJE[kljuc])).toBe(ocekivano);
      });
    }
    for (const putanja of Object.keys(STRANICE) as PutanjaStranice[]) {
      const ocekivano = DOPUSTENE_STRANICE[uloga.naziv]!.includes(putanja);
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
    expect(putanje("Prodavač")).toEqual(["/", "/partneri", "/cjenici", "/sifrarnici", "/moj-racun"]);
    expect(putanje("Administrator")).toEqual(["/", "/partneri", "/cjenici", "/sifrarnici", "/korisnici", "/uloge", "/dnevnik", "/moj-racun"]);
    expect(prvaDopustena(pravaUloge("Knjigovođa"), IZBORNIK)).toBe("/partneri");
  });

  it("svaka stranica iz popisa je u izborniku", () => {
    expect(IZBORNIK.map((s) => s.putanja).sort()).toEqual(Object.keys(STRANICE).sort());
  });
});
