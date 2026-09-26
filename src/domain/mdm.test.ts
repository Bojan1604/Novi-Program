import { describe, expect, it } from "vitest";
import { kodUpisa, naVezi, normalizirajKod, procitajUpis, provjeriNadredenu, vidljiveOrganizacije } from "./mdm";

describe("MDM pravila", () => {
  it("kod upisa: 12 znakova bez zamjenjivih, upis tolerantan na mala slova i razmake", () => {
    const k = kodUpisa(new Uint8Array(12).map((_, i) => i * 17));
    expect(k).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(k).not.toMatch(/[01IOL]/);
    expect(normalizirajKod(k.toLowerCase().replace(/-/g, " "))).toBe(k);
    expect(normalizirajKod("ABCD-EFGH-IJK0")).toBeNull();
    expect(normalizirajKod("ABCD")).toBeNull();
  });

  it("upis agenta: obavezni kod, serijski i platforma; ostalo skraćeno", () => {
    expect(procitajUpis(null)).toMatchObject({ ok: false });
    expect(procitajUpis({ kod: "x", serijski: "SN1", platforma: "ANDROID" })).toEqual({ ok: false, greska: "Kod upisa nije ispravan." });
    expect(procitajUpis({ kod: "ABCD-EFGH-JKMN", serijski: "a b", platforma: "ANDROID" })).toMatchObject({ ok: false });
    expect(procitajUpis({ kod: "ABCD-EFGH-JKMN", serijski: "sn-123", platforma: "IOS" })).toMatchObject({ ok: false });
    const r = procitajUpis({ kod: "abcd efgh jkmn", serijski: "sn-123", platforma: "WINDOWS", model: "x".repeat(300), naziv: 5 });
    expect(r).toMatchObject({ ok: true, vrijednost: { kod: "ABCD-EFGH-JKMN", serijski: "SN-123", platforma: "WINDOWS", naziv: null } });
    if (r.ok) expect(r.vrijednost.model).toHaveLength(100);
  });

  const org = [
    { id: "d1", nadredenaId: null, partnerId: "P1", vrsta: "DISTRIBUTER" },
    { id: "k1", nadredenaId: "d1", partnerId: "P3", vrsta: "KLIJENT" },
    { id: "k2", nadredenaId: "d1", partnerId: null, vrsta: "KLIJENT" },
    { id: "d2", nadredenaId: null, partnerId: "P2", vrsta: "DISTRIBUTER" },
    { id: "k3", nadredenaId: "d2", partnerId: null, vrsta: "KLIJENT" },
  ];

  it("distributer vidi samo svoje i ispod sebe; klijent samo sebe", () => {
    expect([...vidljiveOrganizacije(org, "P1")].sort()).toEqual(["d1", "k1", "k2"]);
    expect([...vidljiveOrganizacije(org, "P2")].sort()).toEqual(["d2", "k3"]);
    expect([...vidljiveOrganizacije(org, "P3")]).toEqual(["k1"]);
    expect(vidljiveOrganizacije(org, "P9").size).toBe(0);
    // petlja u podacima ne ruši ni ne širi pogled
    expect(
      [
        ...vidljiveOrganizacije(
          [
            { id: "a", nadredenaId: "b", partnerId: "X" },
            { id: "b", nadredenaId: "a", partnerId: null },
          ],
          "X",
        ),
      ].sort(),
    ).toEqual(["a", "b"]);
  });

  it("nadređena: samo distributer, bez petlji", () => {
    expect(provjeriNadredenu(org, null, "KLIJENT", "d1")).toBeNull();
    expect(provjeriNadredenu(org, null, "KLIJENT", "k1")).toMatch(/distributer/);
    expect(provjeriNadredenu(org, null, "KLIJENT", "nema")).toMatch(/ne postoji/);
    expect(provjeriNadredenu(org, "d1", "DISTRIBUTER", "d1")).toMatch(/samom sobom/);
    expect(provjeriNadredenu(org, null, "KLIJENT", null)).toBeNull();
  });

  it("na vezi 15 minuta", () => {
    const s = new Date("2026-09-26T10:00:00Z");
    expect(naVezi(new Date("2026-09-26T09:50:00Z"), s)).toBe(true);
    expect(naVezi(new Date("2026-09-26T09:40:00Z"), s)).toBe(false);
    expect(naVezi(null, s)).toBe(false);
  });
});
