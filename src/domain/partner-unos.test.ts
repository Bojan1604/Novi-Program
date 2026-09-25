import { describe, expect, it } from "vitest";
import { procitajPartnera } from "./partner-unos";

const iz = (o: Record<string, string>) => (ime: string) => o[ime] ?? null;

describe("unos partnera", () => {
  it("domaći kupac", () => {
    const r = procitajPartnera(
      iz({
        naziv: " Primjer  d.o.o. ",
        kupac: "on",
        drzava: "HR",
        oib: "69435151530",
        pdvBroj: "69435151530",
        postanskiBroj: "10000",
        email: "Ured@Primjer.hr",
        eRacunAdresa: "69435151530",
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      vrijednost: {
        naziv: "Primjer d.o.o.",
        kupac: true,
        dobavljac: false,
        oib: "69435151530",
        pdvBroj: "HR69435151530",
        email: "ured@primjer.hr",
        eRacunAdresa: "9934:69435151530",
        rokPlacanjaDana: 15,
      },
    });
  });

  it("strani dobavljač s PDV brojem", () => {
    const r = procitajPartnera(iz({ naziv: "GmbH", dobavljac: "on", drzava: "DE", pdvBroj: "123456789", postanskiBroj: "80331" }));
    expect(r).toMatchObject({ ok: true, vrijednost: { drzava: "DE", pdvBroj: "DE123456789", oib: null } });
  });

  it("greške su uz polja", () => {
    const r = procitajPartnera(
      iz({ naziv: "", drzava: "DE", oib: "69435151530", pdvBroj: "FR123", email: "x@", rokPlacanjaDana: "400", postanskiBroj: "123" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.polja).sort()).toEqual(["email", "kupac", "naziv", "oib", "pdvBroj", "rokPlacanjaDana"]);
  });

  it("HR: PDV broj mora biti HR + OIB istog partnera; poštanski broj 5 znamenki", () => {
    const r = procitajPartnera(iz({ naziv: "X", kupac: "on", drzava: "HR", oib: "69435151530", pdvBroj: "HR94577403194", postanskiBroj: "1000" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.polja).sort()).toEqual(["pdvBroj", "postanskiBroj"]);
  });

  it("nepoznata država i porezni status", () => {
    const r = procitajPartnera(iz({ naziv: "X", kupac: "on", drzava: "ZZ", pdvStatus: "NESTO" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.polja).sort()).toEqual(["drzava", "pdvStatus"]);
  });
});
