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
  "racun.dva-koraka": SVI,
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
  "uredaji.ispravak": ["Administrator", "Voditelj", "Skladištar"],
  "uredaji.obrisi": ["Administrator", "Voditelj"],
  "uredaji.prilogDodaj": ["Administrator", "Voditelj", "Skladištar"],
  "uredaji.prilogObrisi": ["Administrator", "Voditelj", "Skladištar"],
  "skeniranje.provjera": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "skladisni.izdaj": ["Administrator", "Voditelj", "Skladištar"],
  "odobrenja.odluci": ["Administrator", "Voditelj"],
  "inventure.uredi": ["Administrator", "Voditelj", "Skladištar"],
  "prodaja.spremi": ["Administrator", "Voditelj", "Prodavač"],
  "prodaja.izdaj": ["Administrator", "Voditelj", "Prodavač"],
  "prodaja.pretvori": ["Administrator", "Voditelj", "Prodavač"],
  "prodaja.obrisi": ["Administrator", "Voditelj", "Prodavač"],
  "prodaja.podaci": ["Administrator", "Voditelj", "Prodavač"],
  "uplate.unos": ["Administrator", "Voditelj", "Prodavač"],
  "prodaja.storno": ["Administrator", "Voditelj"],
  "eposta.slanje": ["Administrator", "Voditelj", "Prodavač"],
  "postavke.spremi": ["Administrator"],
  "prodaja.odobrenje": ["Administrator", "Voditelj"],
  "uplate.ponisti": ["Administrator", "Voditelj"],
  "eracun.posalji": ["Administrator", "Voditelj", "Prodavač"],
  "eracun.izvjestaji": ["Administrator", "Voditelj"],
  "najam.ugovor": ["Administrator", "Voditelj", "Prodavač"],
  "najam.otkaz": ["Administrator", "Voditelj"],
  "najam.prilozi": ["Administrator", "Voditelj", "Prodavač"],
  "najam.izdaj": ["Administrator", "Voditelj", "Prodavač"],
  "najam.izvan": ["Administrator", "Voditelj", "Prodavač"],
  "najam.povrat": ["Administrator", "Voditelj", "Prodavač"],
  "nabava.narudzbenica": ["Administrator", "Voditelj", "Skladištar"],
  "nabava.zaprimi": ["Administrator", "Voditelj", "Skladištar"],
  "nabava.status": ["Administrator", "Voditelj"],
  "ulazni.spremi": ["Administrator", "Voditelj", "Skladištar"],
  "ulazni.storno": ["Administrator", "Voditelj"],
  "ulazni.prilozi": ["Administrator", "Voditelj", "Skladištar"],
  "ulazni.eracun": ["Administrator", "Voditelj", "Skladištar"],
  "ulazni.plati": ["Administrator", "Voditelj", "Skladištar"],
  "troskovi.spremi": ["Administrator", "Voditelj"],
  "troskovi.obrisi": ["Administrator"],
  "troskovi.prilozi": ["Administrator", "Voditelj"],
  "knjigovodja.predaja": ["Administrator", "Voditelj", "Knjigovođa"],
  "dosljednost.popravi": ["Administrator"],
  "kopije.izradi": ["Administrator"],
  "kopije.vrati": ["Administrator"],
  "servis.zaprimi": ["Administrator", "Voditelj", "Serviser"],
  "servis.uredi": ["Administrator", "Voditelj", "Serviser"],
  "servis.zamjena": ["Administrator", "Voditelj", "Serviser"],
  "servis.zavrsi": ["Administrator", "Voditelj", "Serviser"],
  "servis.otpis": ["Administrator", "Voditelj"],
  "servis.obrisi": ["Administrator", "Voditelj"],
  "servis.prilozi": ["Administrator", "Voditelj", "Serviser"],
  "portal.upravljaj": ["Administrator", "Voditelj"],
  "mdm.organizacije": ["Administrator", "Voditelj", "Serviser"],
  "mdm.uredaji": ["Administrator", "Voditelj", "Serviser"],
  "mdm.upravljanje": ["Administrator", "Voditelj", "Serviser"],
  "mdm.naredbe": ["Administrator", "Voditelj", "Serviser"],
};

const TKO_VIDI_STRANICU: Record<PutanjaStranice, string[]> = {
  "/": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "/izvjestaji": ["Administrator", "Voditelj", "Prodavač", "Knjigovođa"],
  "/korisnici": ["Administrator", "Voditelj"],
  "/uloge": ["Administrator", "Voditelj"],
  "/dnevnik": ["Administrator", "Voditelj"],
  "/sifrarnici": ["Administrator", "Voditelj", "Prodavač", "Skladištar"],
  "/moj-racun": SVI,
  "/partneri": SVI,
  "/cjenici": SVI,
  "/primke": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "/uredaji": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "/skeniranje": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "/skladisni": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "/odobrenja": ["Administrator", "Voditelj", "Skladištar"],
  "/inventure": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "/ponude": ["Administrator", "Voditelj", "Prodavač", "Knjigovođa"],
  "/racuni": ["Administrator", "Voditelj", "Prodavač", "Knjigovođa"],
  "/eracuni": ["Administrator", "Voditelj", "Prodavač", "Knjigovođa"],
  "/marze": ["Administrator", "Voditelj", "Knjigovođa"],
  "/najam": ["Administrator", "Voditelj", "Prodavač", "Knjigovođa"],
  "/najam/rate": ["Administrator", "Voditelj", "Prodavač"],
  "/servis": ["Administrator", "Voditelj", "Prodavač", "Skladištar", "Serviser"],
  "/mdm": ["Administrator", "Voditelj", "Serviser"],
  "/nabava": ["Administrator", "Voditelj", "Skladištar", "Knjigovođa"],
  "/ulazni": ["Administrator", "Voditelj", "Skladištar", "Knjigovođa"],
  "/troskovi": ["Administrator", "Voditelj", "Knjigovođa"],
  "/knjigovodja": ["Administrator", "Voditelj", "Knjigovođa"],
  "/postavke": ["Administrator", "Voditelj"],
  "/provjera": ["Administrator", "Voditelj"],
  "/kopije": ["Administrator"],
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
    expect(putanje("Prodavač")).toEqual([
      "/",
      "/izvjestaji",
      "/racuni",
      "/ponude",
      "/eracuni",
      "/najam",
      "/najam/rate",
      "/servis",
      "/partneri",
      "/cjenici",
      "/uredaji",
      "/skeniranje",
      "/primke",
      "/skladisni",
      "/inventure",
      "/sifrarnici",
      "/moj-racun",
    ]);
    expect(putanje("Administrator")).toEqual([
      "/",
      "/izvjestaji",
      "/racuni",
      "/ponude",
      "/eracuni",
      "/marze",
      "/najam",
      "/najam/rate",
      "/servis",
      "/mdm",
      "/nabava",
      "/ulazni",
      "/troskovi",
      "/knjigovodja",
      "/partneri",
      "/cjenici",
      "/uredaji",
      "/skeniranje",
      "/primke",
      "/skladisni",
      "/odobrenja",
      "/inventure",
      "/sifrarnici",
      "/korisnici",
      "/uloge",
      "/dnevnik",
      "/postavke",
      "/provjera",
      "/kopije",
      "/moj-racun",
    ]);
    expect(prvaDopustena(pravaUloge("Knjigovođa"), IZBORNIK)).toBe("/izvjestaji");
  });

  it("svaka stranica iz popisa je u izborniku", () => {
    expect(IZBORNIK.map((s) => s.putanja).sort()).toEqual(Object.keys(STRANICE).sort());
  });
});
