import { describe, expect, it } from "vitest";
import {
  efektivnaPrava,
  imaPravo,
  jeAdministrator,
  jeNadskup,
  POPIS_MODULA,
  praznaPrava,
  procitajIznimke,
  procitajPrava,
  punaPrava,
  RAZINE,
  smijeUpravljati,
  smijeUrediti,
  ZADANE_ULOGE,
  type Prava,
} from "./prava";

const uloga = (naziv: string): Prava => ZADANE_ULOGE.find((u) => u.naziv === naziv)!.prava;
const s = (moduli: Partial<Prava["moduli"]>, posebna: Partial<Prava["posebna"]> = {}): Prava => ({
  moduli: { ...praznaPrava().moduli, ...moduli },
  posebna: { ...praznaPrava().posebna, ...posebna },
});

describe("imaPravo — razine su uređene", () => {
  it.each(RAZINE.flatMap((ima) => RAZINE.map((treba) => [ima, treba] as const)))("ima %s, treba %s", (ima, treba) => {
    expect(imaPravo(s({ prodaja: ima }), "prodaja", treba)).toBe(RAZINE.indexOf(ima) >= RAZINE.indexOf(treba));
  });
});

describe("čitanje prava iz nepouzdanog izvora", () => {
  it("nepoznato se odbacuje, nedostajuće je nema/false", () => {
    const p = procitajPrava({ moduli: { prodaja: "puno", izmisljeno: "puno", najam: "super" }, posebna: { costs: "da", log: true } });
    expect(p.moduli.prodaja).toBe("puno");
    expect(p.moduli.najam).toBe("nema");
    expect(p.posebna.costs).toBe(false);
    expect(p.posebna.log).toBe(true);
    expect(Object.keys(p.moduli)).toEqual(POPIS_MODULA);
    expect(procitajPrava(null)).toEqual(praznaPrava());
  });

  it("iznimke zadržavaju samo ispravne vrijednosti", () => {
    expect(procitajIznimke({ moduli: { prodaja: "pregled", x: "puno" }, posebna: { costs: false, y: true } })).toEqual({
      moduli: { prodaja: "pregled" },
      posebna: { costs: false },
    });
  });
});

describe("iznimke po korisniku", () => {
  it("nadjačavaju ulogu u oba smjera", () => {
    const p = efektivnaPrava(uloga("Prodavač"), { moduli: { prodaja: "pregled", servis: "operativno" }, posebna: { costs: true } });
    expect(p.moduli.prodaja).toBe("pregled");
    expect(p.moduli.servis).toBe("operativno");
    expect(p.posebna.costs).toBe(true);
    expect(p.moduli.partneri).toBe("operativno");
  });
});

describe("zadane uloge", () => {
  it("samo Administrator ima sva prava", () => {
    for (const u of ZADANE_ULOGE) expect(jeAdministrator(u.prava)).toBe(u.naziv === "Administrator");
  });

  it("nabavne cijene vide samo Administrator, Voditelj i Knjigovođa", () => {
    expect(ZADANE_ULOGE.filter((u) => u.prava.posebna.costs).map((u) => u.naziv)).toEqual(["Administrator", "Voditelj", "Knjigovođa"]);
  });

  it("opasnu zonu ima samo Administrator", () => {
    expect(ZADANE_ULOGE.filter((u) => u.prava.posebna.opasnaZona).map((u) => u.naziv)).toEqual(["Administrator"]);
  });

  it("korisnicima upravlja samo Administrator", () => {
    expect(ZADANE_ULOGE.filter((u) => imaPravo(u.prava, "korisnici", "puno")).map((u) => u.naziv)).toEqual(["Administrator"]);
  });
});

describe("jeNadskup", () => {
  it("puna prava su nadskup svega", () => {
    for (const u of ZADANE_ULOGE) expect(jeNadskup(punaPrava(), u.prava)).toBe(true);
  });
  it("posebno pravo koje nemam ruši nadskup", () => {
    expect(jeNadskup(s({ prodaja: "puno" }), s({ prodaja: "pregled" }, { costs: true }))).toBe(false);
  });
});

describe("smijeUpravljati — nitko ne preuzima jači račun", () => {
  const admin = { id: "admin", prava: punaPrava() };
  const admin2 = { id: "admin2", prava: punaPrava() };
  const upraviteljBezCosts = { id: "upr", prava: s({ korisnici: "puno", prodaja: "puno" }) };
  const prodavac = { id: "prod", prava: uloga("Prodavač") };

  it("administrator upravlja drugima, i drugim administratorom", () => {
    expect(smijeUpravljati(admin, prodavac).dopusteno).toBe(true);
    expect(smijeUpravljati(admin, admin2, punaPrava()).dopusteno).toBe(true);
  });

  it("nitko ne mijenja vlastita prava", () => {
    expect(smijeUpravljati(admin, admin, praznaPrava())).toEqual({ dopusteno: false, razlog: expect.stringContaining("vlastita") });
  });

  it("korisnik smije mijenjati vlastite podatke (bez prava) ako upravlja korisnicima", () => {
    expect(smijeUpravljati(upraviteljBezCosts, upraviteljBezCosts).dopusteno).toBe(true);
  });

  it("ne-administrator ne upravlja administratorom (ni lozinkom)", () => {
    expect(smijeUpravljati(upraviteljBezCosts, admin).dopusteno).toBe(false);
  });

  it("ne upravlja korisnikom koji ima posebno pravo koje on nema", () => {
    const sCosts = { id: "c", prava: s({ prodaja: "pregled" }, { costs: true }) };
    expect(smijeUpravljati(upraviteljBezCosts, sCosts).dopusteno).toBe(false);
  });

  it("ne dodjeljuje prava koja sam nema", () => {
    const slabiji = { id: "slab", prava: s({ prodaja: "pregled" }) };
    expect(smijeUpravljati(upraviteljBezCosts, slabiji, s({ najam: "puno" })).dopusteno).toBe(false);
    expect(smijeUpravljati(upraviteljBezCosts, slabiji, s({ prodaja: "puno" })).dopusteno).toBe(true);
    // prodavač ima module koje upravitelj nema — njime uopće ne upravlja
    expect(smijeUpravljati(upraviteljBezCosts, prodavac).dopusteno).toBe(false);
  });

  it("bez prava na korisnike ne upravlja nikim", () => {
    expect(smijeUpravljati(prodavac, { id: "x", prava: praznaPrava() }).dopusteno).toBe(false);
  });
});

describe("smijeUrediti ulogu", () => {
  it("uloga ne smije dobiti više od onoga koji je uređuje", () => {
    expect(smijeUrediti(s({ korisnici: "puno", prodaja: "operativno" }), s({ prodaja: "puno" })).dopusteno).toBe(false);
    expect(smijeUrediti(punaPrava(), uloga("Voditelj")).dopusteno).toBe(true);
    expect(smijeUrediti(uloga("Voditelj"), s({})).dopusteno).toBe(false);
  });
});
