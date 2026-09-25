import { describe, expect, it } from "vitest";
import { POPIS_RADNJI, POPIS_STANJA, prijelaz, provjeriSerijski, type Stanje, type VrstaRadnje } from "./stanja-uredaja";

/**
 * MATRICA SVIH PRIJELAZA, napisana ručno: [radnja][stanje] = novo stanje ili "—" (nedopušteno).
 * „novi“ = uređaj još ne postoji. Promjena pravila = namjerna promjena ove tablice.
 */
// prettier-ignore
const MATRICA: Record<VrstaRadnje, Record<Stanje | "novi", Stanje | "—">> = {
  //                 novi            U_DOLASKU        NA_SKLADISTU     REZERVIRAN       PRODAN           U_NAJMU          NA_SERVISU       OTPISAN
  najava:           { novi: "U_DOLASKU",    U_DOLASKU: "—",            NA_SKLADISTU: "—",          REZERVIRAN: "—",           PRODAN: "—",           U_NAJMU: "—",          NA_SERVISU: "—",   OTPISAN: "—" },
  zaprimanje:       { novi: "NA_SKLADISTU", U_DOLASKU: "NA_SKLADISTU", NA_SKLADISTU: "—",          REZERVIRAN: "—",           PRODAN: "—",           U_NAJMU: "—",          NA_SERVISU: "—",   OTPISAN: "—" },
  rezervacija:      { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "REZERVIRAN", REZERVIRAN: "—",           PRODAN: "—",           U_NAJMU: "—",          NA_SERVISU: "—",   OTPISAN: "—" },
  otkazRezervacije: { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "—",          REZERVIRAN: "NA_SKLADISTU", PRODAN: "—",          U_NAJMU: "—",          NA_SERVISU: "—",   OTPISAN: "—" },
  prodaja:          { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "PRODAN",     REZERVIRAN: "PRODAN",      PRODAN: "—",           U_NAJMU: "PRODAN",     NA_SERVISU: "—",   OTPISAN: "—" },
  stornoProdaje:    { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "—",          REZERVIRAN: "—",           PRODAN: "NA_SKLADISTU", U_NAJMU: "—",         NA_SERVISU: "—",   OTPISAN: "—" },
  najam:            { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "U_NAJMU",    REZERVIRAN: "U_NAJMU",     PRODAN: "—",           U_NAJMU: "—",          NA_SERVISU: "—",   OTPISAN: "—" },
  povratIzNajma:    { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "—",          REZERVIRAN: "—",           PRODAN: "—",           U_NAJMU: "NA_SKLADISTU", NA_SERVISU: "—", OTPISAN: "—" },
  ulazNaServis:     { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "NA_SERVISU", REZERVIRAN: "NA_SERVISU",  PRODAN: "NA_SERVISU",  U_NAJMU: "NA_SERVISU", NA_SERVISU: "—",   OTPISAN: "—" },
  izlazSaServisa:   { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "—",          REZERVIRAN: "—",           PRODAN: "—",           U_NAJMU: "—",          NA_SERVISU: "NA_SKLADISTU", OTPISAN: "—" },
  otpis:            { novi: "—",            U_DOLASKU: "OTPISAN",      NA_SKLADISTU: "OTPISAN",    REZERVIRAN: "OTPISAN",     PRODAN: "—",           U_NAJMU: "—",          NA_SERVISU: "OTPISAN", OTPISAN: "—" },
  ponistenjeOtpisa: { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "—",          REZERVIRAN: "—",           PRODAN: "—",           U_NAJMU: "—",          NA_SERVISU: "—",   OTPISAN: "NA_SKLADISTU" },
  medjuskladisnica: { novi: "—",            U_DOLASKU: "—",            NA_SKLADISTU: "NA_SKLADISTU", REZERVIRAN: "REZERVIRAN", PRODAN: "—",          U_NAJMU: "—",          NA_SERVISU: "—",   OTPISAN: "—" },
};

describe("matrica svih prijelaza (svaka radnja × svako stanje)", () => {
  it("matrica pokriva sve radnje i sva stanja", () => {
    expect(Object.keys(MATRICA).sort()).toEqual([...POPIS_RADNJI].sort());
    for (const r of POPIS_RADNJI) expect(Object.keys(MATRICA[r]).sort()).toEqual(["novi", ...POPIS_STANJA].sort());
  });

  for (const radnja of POPIS_RADNJI) {
    for (const stanje of ["novi", ...POPIS_STANJA] as const) {
      const ocekivano = MATRICA[radnja][stanje];
      it(`${radnja} iz ${stanje} → ${ocekivano}`, () => {
        const r = prijelaz(radnja, stanje === "novi" ? null : stanje, null, "SN1");
        if (ocekivano === "—") {
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.razlog.length).toBeGreaterThan(10);
        } else {
          expect(r).toMatchObject({ ok: true, novo: ocekivano });
        }
      });
    }
  }
});

describe("završetak servisa vraća u stanje prije servisa", () => {
  it.each([
    ["U_NAJMU", "U_NAJMU"],
    ["PRODAN", "PRODAN"],
    ["NA_SKLADISTU", "NA_SKLADISTU"],
    ["REZERVIRAN", "REZERVIRAN"],
    [null, "NA_SKLADISTU"],
  ] as const)("prije servisa %s → nakon %s", (prije, nakon) => {
    expect(prijelaz("izlazSaServisa", "NA_SERVISU", prije)).toMatchObject({ ok: true, novo: nakon });
  });
});

describe("razlog nedopuštenog prijelaza je razumljiv", () => {
  it("prodan uređaj ne može u najam", () => {
    expect(prijelaz("najam", "PRODAN", null, "SN123")).toEqual({
      ok: false,
      razlog: "Uređaj SN123 je „Prodan“ — radnja „davanje u najam“ nije moguća (moguća samo iz stanja: „Na skladištu“, „Rezerviran“).",
    });
  });
  it("nepostojeći uređaj", () => {
    expect(prijelaz("prodaja", null, null, "X1")).toEqual({ ok: false, razlog: "Uređaj X1 ne postoji — prvo ga treba zaprimiti." });
  });
  it("dupli zaprimljeni", () => {
    expect(prijelaz("najava", "NA_SKLADISTU", null, "X1")).toEqual({ ok: false, razlog: "Uređaj X1 već postoji (Na skladištu)." });
  });
});

describe("serijski broj", () => {
  it.each([
    [" pf3abc12 ", "PF3ABC12"],
    ["5CD 123 4XYZ", "5CD1234XYZ"],
    ["SN-2024/001", "SN-2024/001"],
  ])("„%s“ → %s", (u, v) => expect(provjeriSerijski(u)).toEqual({ ok: true, vrijednost: v }));
  it.each(["", "  ", "AB", "X".repeat(61), "SN€12", "ŠČĆ123"])("„%s“ → greška", (u) => expect(provjeriSerijski(u).ok).toBe(false));
});
