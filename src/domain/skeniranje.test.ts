import { describe, expect, it } from "vitest";
import { dodajUSkupno, kandidatiIzTeksta, serijskiIzKoda } from "./skeniranje";

describe("serijski iz koda", () => {
  it("goli serijski, mala slova i razmaci", () => {
    expect(serijskiIzKoda("pf3abc12")).toBe("PF3ABC12");
    expect(serijskiIzKoda("  5CD1234XYZ \r\n")).toBe("5CD1234XYZ");
  });
  it("oznake S/N, SN:, Serial No.", () => {
    expect(serijskiIzKoda("S/N: PF3ABC12")).toBe("PF3ABC12");
    expect(serijskiIzKoda("SN PF3ABC12")).toBe("PF3ABC12");
    expect(serijskiIzKoda("Serial No. CN0ABC123")).toBe("CN0ABC123");
  });
  it("naš QR s poveznicom na uređaj; druge poveznice nisu serijski", () => {
    expect(serijskiIzKoda("https://erp.firma.hr/uredaji/sn/PF3ABC12")).toBe("PF3ABC12");
    expect(serijskiIzKoda("http://192.168.1.10:3000/uredaji/sn/AB%2F123")).toBe("AB/123");
    expect(serijskiIzKoda("https://www.dell.com/support")).toBeNull();
  });
  it("GS1: (21) serijski i sirovi oblik s GS znakom", () => {
    expect(serijskiIzKoda("(01)09506000134352(21)ABC123456")).toBe("ABC123456");
    expect(serijskiIzKoda("]d20109506000134352" + "21XYZ98765\u001d10LOT1")).toBe("XYZ98765");
  });
  it("neispravno → null", () => {
    expect(serijskiIzKoda("")).toBeNull();
    expect(serijskiIzKoda("ab")).toBeNull();
    expect(serijskiIzKoda("ovo nije serijski broj")).toBeNull();
  });
});

describe("kandidati iz teksta (OCR)", () => {
  it("serijski uz oznaku prvi, zatim ostale riječi sa slovima i brojkama", () => {
    const tekst = "LENOVO\nMODEL: 21HD0045SC\nS/N: PF3ABC12\nMade in China\n20V 3.25A";
    expect(kandidatiIzTeksta(tekst)).toEqual(["PF3ABC12", "21HD0045SC"]);
  });
  it("bez oznake: samo riječi s i slovima i brojkama, bez ponavljanja", () => {
    expect(kandidatiIzTeksta("Serial Number CN0H5X2K 123456 ABCDEF CN0H5X2K")).toEqual(["CN0H5X2K"]);
  });
  it("prazno", () => {
    expect(kandidatiIzTeksta("")).toEqual([]);
  });
});

describe("skupni način", () => {
  it("novi na vrh, ponovljeni se broji", () => {
    let p = dodajUSkupno([], "A1").popis;
    p = dodajUSkupno(p, "B2").popis;
    const r = dodajUSkupno(p, "A1");
    expect(r.nov).toBe(false);
    expect(r.popis).toEqual([
      { serijski: "B2", puta: 1 },
      { serijski: "A1", puta: 2 },
    ]);
  });
});
