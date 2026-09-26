import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { iznosUvoza, provjeriUvoz } from "./uvoz";

const primjer = () => JSON.parse(readFileSync("docs/primjer-uvoza.json", "utf8")) as Record<string, unknown>;
const DANAS = "2026-09-26";

describe("uvoz: provjera datoteke", () => {
  it("primjer iz dokumentacije prolazi bez grešaka", () => {
    const r = provjeriUvoz(primjer(), DANAS);
    expect(r.greske).toEqual([]);
    expect(r.podaci.modeli).toHaveLength(2);
    expect(r.podaci.uredaji.map((u) => u.serijski)).toEqual(["UV-0001", "UV-0002", "UV-0003", "UV-0004"]);
    const rac = r.podaci.racuni[0]!;
    expect(rac).toMatchObject({ broj: "41/PP1/1", redni: 41, prostor: "PP1", naplatniUredaj: "1", ukupno: 119125 });
    expect(rac.stavke[1]).toMatchObject({ kolicina: 1500, cijena: 4000, popust: 1000, stopa: 2500, vrstaIsporuke: "USLUGA" });
    expect(r.podaci.ugovori[0]).toMatchObject({ naplacenoDo: "2025-12", uredaji: [{ serijski: "UV-0003", od: "2025-06-01", cijena: 1200 }] });
    expect(r.podaci.partneri[0]).toMatchObject({ oib: "33392005961", pdvBroj: "HR33392005961" });
  });

  it("iznosi strogo: tekst ili broj s točkom; smeće je greška, nikad 0", () => {
    expect(iznosUvoza("1234.5")).toBe(123450);
    expect(iznosUvoza(12.34)).toBe(1234);
    expect(iznosUvoza("-20.00")).toBe(-2000);
    expect(iznosUvoza("1.500,00")).toBeNull();
    expect(iznosUvoza("abc")).toBeNull();
    expect(iznosUvoza(1.234)).toBeNull();
    expect(iznosUvoza(null)).toBeNull();
  });

  it("greške: krivi format, dupli serijski, nepoznat model, krivi broj računa, budući datum, uređaj na dva ugovora", () => {
    expect(provjeriUvoz({ format: "nesto" }, DANAS).greske[0]!.poruka).toMatch(/format/);
    const p = primjer();
    (p["uredaji"] as unknown[]).push({ serijski: "uv-0001", model: "DL-5440" }, { serijski: "X9", model: "Nepostojeći" });
    (p["racuni"] as unknown[]).push(
      { broj: "R-42", datum: "2025-01-01", stavke: [{ naziv: "x", cijena: 1 }] },
      { broj: "43/PP1/1", datum: "2027-01-01", stavke: [{ naziv: "x", cijena: 1 }] },
      { broj: "41/PP1/1", datum: "2025-12-01", stavke: [{ naziv: "x", cijena: "1,00" }] },
    );
    (p["ugovoriNajma"] as unknown[]).push({ broj: "UG-2", partner: "K001", od: "2025-01-01", uredaji: [{ serijski: "UV-0003", cijena: 5 }] });
    const g = provjeriUvoz(p, DANAS)
      .greske.map((x) => x.poruka)
      .join("\n");
    expect(g).toMatch(/Serijski UV-0001 se ponavlja/);
    expect(g).toMatch(/model „Nepostojeći“/);
    expect(g).toMatch(/redni\/prostor\/uređaj/);
    expect(g).toMatch(/u budućnosti/);
    expect(g).toMatch(/Račun 41\/PP1\/1 u 2025\. se ponavlja/);
    expect(g).toMatch(/UV-0003 je na više ugovora/);
  });

  it("upozorenja: neispravan OIB (uvozi se bez njega), račun bez JIR-a i bez iznosa, servis → skladište, najam bez ugovora", () => {
    const p = primjer();
    (p["partneri"] as Record<string, unknown>[])[0]!["oib"] = "12345678901";
    (p["racuni"] as Record<string, unknown>[])[0]!["jir"] = null;
    delete (p["racuni"] as Record<string, unknown>[])[0]!["ukupno"];
    (p["uredaji"] as unknown[]).push(
      { serijski: "S1", model: "HP-E24", stanje: "NA_SERVISU" },
      { serijski: "S2", model: "HP-E24", stanje: "U_NAJMU", partner: "K001" },
    );
    const r = provjeriUvoz(p, DANAS);
    expect(r.greske).toEqual([]);
    const u = r.upozorenja.map((x) => x.poruka).join("\n");
    expect(u).toMatch(/OIB 12345678901 .* nije ispravan/);
    expect(u).toMatch(/nema JIR/);
    expect(u).toMatch(/Nema ukupnog iznosa/);
    expect(u).toMatch(/S1 je na servisu/);
    expect(u).toMatch(/u najmu, ali nije ni na jednom ugovoru/);
    expect(r.podaci.partneri[0]!.oib).toBeNull();
    expect(r.podaci.uredaji.find((x) => x.serijski === "S1")!.stanje).toBe("NA_SKLADISTU");
  });
});
