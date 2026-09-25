import { describe, expect, it } from "vitest";
import { izbornikZa, prvaDopustena } from "@/domain/izbornik";
import { imaPravo, ZADANE_ULOGE } from "@/domain/prava";
import { AKCIJE, STRANICE, zadovoljava, type KljucAkcije, type PutanjaStranice } from "./akcije-prava";
import { IZBORNIK } from "./izbornik";

const pravaUloge = (naziv: string) => ZADANE_ULOGE.find((u) => u.naziv === naziv)!.prava;

/**
 * Očekivanja napisana RUČNO (ne izračunata istom funkcijom): što koja uloga smije.
 * Nova akcija ili stranica mora se dodati ovdje, inače test pukne.
 */
const DOPUSTENE_AKCIJE: Record<string, KljucAkcije[]> = {
  Administrator: ["korisnici.dodaj", "korisnici.uredi", "korisnici.lozinka", "uloge.spremi", "uloge.obrisi"],
  Voditelj: [],
  "Prodavač": [],
  "Skladištar": [],
  Serviser: [],
  "Knjigovođa": [],
};

const DOPUSTENE_STRANICE: Record<string, PutanjaStranice[]> = {
  Administrator: ["/", "/korisnici", "/uloge"],
  Voditelj: ["/", "/korisnici", "/uloge"],
  "Prodavač": ["/"],
  "Skladištar": ["/"],
  Serviser: ["/"],
  "Knjigovođa": [],
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
        const s = STRANICE[putanja];
        expect(imaPravo(uloga.prava, s.modul, s.razina)).toBe(ocekivano);
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
    expect(izbornikZa(pravaUloge("Prodavač"), IZBORNIK).map((s) => s.putanja)).toEqual(["/"]);
    expect(izbornikZa(pravaUloge("Administrator"), IZBORNIK).map((s) => s.putanja)).toEqual(["/", "/korisnici", "/uloge"]);
    expect(prvaDopustena(pravaUloge("Knjigovođa"), IZBORNIK)).toBeNull();
  });

  it("svaka stranica iz popisa je u izborniku", () => {
    expect(IZBORNIK.map((s) => s.putanja).sort()).toEqual(Object.keys(STRANICE).sort());
  });
});
