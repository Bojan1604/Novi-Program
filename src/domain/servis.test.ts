import { describe, expect, it } from "vitest";
import { ishodZavrsetka, krajNaplateOriginala, provjeriBrisanje, provjeriStatus, sljedeciDan, uredajKlijenta, type Zavrsetak } from "./servis";
import { prijelaz, type Stanje } from "./stanja-uredaja";

describe("servisni nalog", () => {
  it("status se ručno mijenja samo među otvorenima", () => {
    expect(provjeriStatus("ZAPRIMLJEN", "POPRAVAK")).toBeNull();
    expect(provjeriStatus("GOTOV", "DIJAGNOZA")).toBeNull();
    expect(provjeriStatus("ZAPRIMLJEN", "ZAPRIMLJEN")).toMatch(/već/);
    expect(provjeriStatus("VRACEN", "POPRAVAK")).toMatch(/zatvoren/);
    expect(provjeriStatus("POPRAVAK", "OTPISAN")).toMatch(/Nepoznat/);
    expect(provjeriStatus("POPRAVAK", "PRIJAVLJEN")).toMatch(/Nepoznat/);
    expect(provjeriStatus("PRIJAVLJEN", "POPRAVAK")).toMatch(/zaprimite/);
  });

  it("zamjenski samo za uređaj kod klijenta", () => {
    expect(uredajKlijenta("PRODAN")).toBe(true);
    expect(uredajKlijenta("U_NAJMU")).toBe(true);
    expect(uredajKlijenta("NA_SKLADISTU")).toBe(false);
    expect(uredajKlijenta("REZERVIRAN")).toBe(false);
  });

  it("brisanje samo tek zaprimljenog bez zamjene", () => {
    expect(provjeriBrisanje({ status: "ZAPRIMLJEN", imaoZamjenu: false })).toBeNull();
    expect(provjeriBrisanje({ status: "DIJAGNOZA", imaoZamjenu: false })).toMatch(/otkažite/);
    expect(provjeriBrisanje({ status: "ZAPRIMLJEN", imaoZamjenu: true })).toMatch(/zamjenskim/);
  });

  /**
   * Nalog nikad ne ostavlja uređaj u krivom stanju: za svako stanje prije servisa × završetak × (sa/bez zamjene)
   * ručno napisano konačno stanje uređaja i zamjenskog (— = završetak nije dopušten).
   */
  const OCEKIVANO: [Stanje, Zavrsetak, boolean, Stanje | "—", Stanje | null][] = [
    ["NA_SKLADISTU", "VRACEN", false, "NA_SKLADISTU", null],
    ["NA_SKLADISTU", "OTKAZAN", false, "NA_SKLADISTU", null],
    ["NA_SKLADISTU", "OTPISAN", false, "OTPISAN", null],
    ["REZERVIRAN", "VRACEN", false, "REZERVIRAN", null],
    ["REZERVIRAN", "OTPISAN", false, "OTPISAN", null],
    ["PRODAN", "VRACEN", false, "PRODAN", null],
    ["PRODAN", "VRACEN", true, "PRODAN", "NA_SKLADISTU"],
    ["PRODAN", "OTKAZAN", true, "PRODAN", "NA_SKLADISTU"],
    ["PRODAN", "OTPISAN", false, "—", null],
    ["PRODAN", "OTPISAN", true, "—", null],
    ["U_NAJMU", "VRACEN", false, "U_NAJMU", null],
    ["U_NAJMU", "VRACEN", true, "U_NAJMU", "NA_SKLADISTU"],
    ["U_NAJMU", "OTKAZAN", true, "U_NAJMU", "NA_SKLADISTU"],
    ["U_NAJMU", "OTPISAN", false, "OTPISAN", null],
    ["U_NAJMU", "OTPISAN", true, "OTPISAN", "U_NAJMU"],
  ];
  it.each(OCEKIVANO)("prije %s, %s, zamjena %s → uređaj %s, zamjenski %s", (prije, z, zamjena, uredaj, zamjenski) => {
    const i = ishodZavrsetka(z, prije, zamjena);
    if (uredaj === "—") return expect(i.ok).toBe(false);
    if (!i.ok) throw new Error(i.razlog);
    const u = prijelaz(i.uredaj!, "NA_SERVISU", prije);
    expect(u).toMatchObject({ ok: true, novo: uredaj });
    if (zamjenski === null) expect(i.zamjena).toBeNull();
    else expect(prijelaz(i.zamjena!, "ZAMJENSKI")).toMatchObject({ ok: true, novo: zamjenski });
  });

  it("prijava s portala prije zaprimanja: samo otkaz, uređaj se ne dira", () => {
    expect(ishodZavrsetka("OTKAZAN", "PRODAN", false, true)).toEqual({ ok: true, uredaj: null, zamjena: null, najam: null });
    expect(ishodZavrsetka("VRACEN", "PRODAN", false, true).ok).toBe(false);
    expect(ishodZavrsetka("OTPISAN", "U_NAJMU", false, true).ok).toBe(false);
    expect(provjeriBrisanje({ status: "PRIJAVLJEN", imaoZamjenu: false })).toBeNull();
  });

  it("najam kod otpisa: bez zamjene se zatvara, sa zamjenom prenosi", () => {
    expect(ishodZavrsetka("OTPISAN", "U_NAJMU", false)).toMatchObject({ najam: "ZATVORI" });
    expect(ishodZavrsetka("OTPISAN", "U_NAJMU", true)).toMatchObject({ najam: "PRENESI" });
    expect(ishodZavrsetka("VRACEN", "U_NAJMU", true)).toMatchObject({ najam: null });
  });

  it("prijenos najma na zamjenski: original se naplaćuje do kraja već fakturiranog, zamjenski od sljedećeg dana", () => {
    expect(krajNaplateOriginala("2026-09-10", null)).toBe("2026-09-10");
    expect(krajNaplateOriginala("2026-09-10", "2026-09")).toBe("2026-09-30");
    expect(krajNaplateOriginala("2026-09-10", "2026-12")).toBe("2026-12-31");
    expect(krajNaplateOriginala("2026-09-10", "2026-08")).toBe("2026-09-10");
    expect(krajNaplateOriginala("2028-02-10", "2028-02")).toBe("2028-02-29");
    expect(sljedeciDan("2026-12-31")).toBe("2027-01-01");
  });
});
