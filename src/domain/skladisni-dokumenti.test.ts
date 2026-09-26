import { describe, expect, it } from "vitest";
import { prijelaz } from "./stanja-uredaja";
import { provjeriUredaj, provjeriZaglavlje, radnjaDokumenta } from "./skladisni-dokumenti";

const MSK = { vrsta: "MEDJUSKLADISNICA" as const, skladisteIzId: "a", skladisteUId: "b", razlog: null };

describe("zaglavlje", () => {
  it("međuskladišnica: oba skladišta i različita", () => {
    expect(provjeriZaglavlje(MSK)).toBeNull();
    expect(provjeriZaglavlje({ ...MSK, skladisteUId: "a" })).toBe("Skladište „iz“ i „u“ ne smije biti isto.");
    expect(provjeriZaglavlje({ ...MSK, skladisteUId: null })).toContain("Odaberite skladište");
  });
  it("izlaz: skladište i razlog; povrat: skladište u", () => {
    expect(provjeriZaglavlje({ vrsta: "IZLAZ", skladisteIzId: "a", skladisteUId: null, razlog: null })).toBe("Odaberite razlog izlaza.");
    expect(provjeriZaglavlje({ vrsta: "IZLAZ", skladisteIzId: "a", skladisteUId: null, razlog: "Oštećen" })).toBeNull();
    expect(provjeriZaglavlje({ vrsta: "POVRAT", skladisteIzId: null, skladisteUId: null, razlog: null })).toContain("vraćaju");
  });
});

describe("uređaj na dokumentu", () => {
  it("međuskladišnica i izlaz: uređaj mora biti u skladištu „iz“", () => {
    expect(provjeriUredaj(MSK, { serijski: "S1", stanje: "NA_SKLADISTU", skladisteId: "a" })).toBeNull();
    expect(provjeriUredaj(MSK, { serijski: "S1", stanje: "NA_SKLADISTU", skladisteId: "b" })).toBe(
      "Uređaj S1 nije u odabranom skladištu (Na skladištu).",
    );
    expect(provjeriUredaj(MSK, { serijski: "S2", stanje: "U_NAJMU", skladisteId: null })).toContain("nije u odabranom skladištu");
  });
  it("povrat: samo iz najma i otpisani; prodani stornom računa", () => {
    const z = { vrsta: "POVRAT" as const, skladisteIzId: null, skladisteUId: "a", razlog: null };
    expect(provjeriUredaj(z, { serijski: "S", stanje: "U_NAJMU", skladisteId: null })).toBeNull();
    expect(provjeriUredaj(z, { serijski: "S", stanje: "OTPISAN", skladisteId: null })).toBeNull();
    expect(provjeriUredaj(z, { serijski: "S", stanje: "PRODAN", skladisteId: null })).toContain("stornom računa");
  });
  it("radnja po vrsti je dopušten prijelaz iz očekivanih stanja", () => {
    expect(prijelaz(radnjaDokumenta("MEDJUSKLADISNICA", "NA_SKLADISTU")!, "NA_SKLADISTU").ok).toBe(true);
    expect(prijelaz(radnjaDokumenta("MEDJUSKLADISNICA", "REZERVIRAN")!, "REZERVIRAN").ok).toBe(true);
    expect(prijelaz(radnjaDokumenta("IZLAZ", "NA_SKLADISTU")!, "NA_SKLADISTU")).toEqual({ ok: true, novo: "OTPISAN", naSkladistu: false });
    expect(prijelaz(radnjaDokumenta("POVRAT", "U_NAJMU")!, "U_NAJMU")).toEqual({ ok: true, novo: "NA_SKLADISTU", naSkladistu: true });
    expect(prijelaz(radnjaDokumenta("POVRAT", "OTPISAN")!, "OTPISAN")).toEqual({ ok: true, novo: "NA_SKLADISTU", naSkladistu: true });
    expect(radnjaDokumenta("POVRAT", "NA_SKLADISTU")).toBeNull();
  });
});
