import { describe, expect, it } from "vitest";
import { brojUgovora, provjeriUgovor, statusUgovora } from "./ugovor-najma";

describe("ugovor o najmu", () => {
  it("status na dan", () => {
    const u = { od: "2026-01-01", do: "2026-12-31", otkazan: null };
    expect(statusUgovora(u, "2025-12-31")).toBe("NA_CEKANJU");
    expect(statusUgovora(u, "2026-01-01")).toBe("AKTIVAN");
    expect(statusUgovora(u, "2026-12-31")).toBe("AKTIVAN");
    expect(statusUgovora(u, "2027-01-01")).toBe("ISTEKAO");
    expect(statusUgovora({ ...u, otkazan: "2026-06-15" }, "2026-06-15")).toBe("AKTIVAN");
    expect(statusUgovora({ ...u, otkazan: "2026-06-15" }, "2026-06-16")).toBe("OTKAZAN");
    expect(statusUgovora({ ...u, do: null }, "2099-01-01")).toBe("AKTIVAN");
  });
  it("provjere upisa", () => {
    const u = { od: "2026-01-01", do: null, rucniBroj: null, rokPlacanjaDana: 15, nacinPlacanja: "T" };
    expect(provjeriUgovor(u)).toEqual({});
    expect(provjeriUgovor({ ...u, od: "" })).toHaveProperty("od");
    expect(provjeriUgovor({ ...u, do: "2025-12-31" })["do"]).toContain("prije početka");
    expect(provjeriUgovor({ ...u, rucniBroj: "  " })).toHaveProperty("broj");
    expect(provjeriUgovor({ ...u, rucniBroj: "UG 12/2025-Đ" })).toEqual({});
    expect(provjeriUgovor({ ...u, rucniBroj: "a<b" })).toHaveProperty("broj");
    expect(provjeriUgovor({ ...u, rokPlacanjaDana: 400 })).toHaveProperty("rokPlacanjaDana");
    expect(brojUgovora(7, 2026)).toBe("NU-7/2026");
  });
});
