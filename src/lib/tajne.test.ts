import { describe, expect, it } from "vitest";
import { desifriraj, sifriraj } from "./tajne";

describe("tajne", () => {
  it("šifriranje i dešifriranje; svaki put drukčije; kriva/izmijenjena tajna → null", () => {
    process.env["TAJNI_KLJUC"] = "testni-kljuc";
    const a = sifriraj("lozinka-č");
    expect(a).not.toContain("lozinka");
    expect(sifriraj("lozinka-č")).not.toBe(a);
    expect(desifriraj(a)).toBe("lozinka-č");
    expect(desifriraj(a.slice(0, -4) + "AAAA")).toBeNull();
    expect(desifriraj("čisti tekst")).toBeNull();
    process.env["TAJNI_KLJUC"] = "drugi";
    expect(desifriraj(a)).toBeNull();
  });

  it("tajna spremljena bez TAJNI_KLJUC čita se i nakon što se ključ postavi (pokreni.bat)", () => {
    delete process.env["TAJNI_KLJUC"];
    const stara = sifriraj("smtp-lozinka");
    process.env["TAJNI_KLJUC"] = "novi-kljuc";
    expect(desifriraj(stara)).toBe("smtp-lozinka");
    const nova = sifriraj("smtp-lozinka");
    delete process.env["TAJNI_KLJUC"];
    expect(desifriraj(nova)).toBeNull();
  });
});
