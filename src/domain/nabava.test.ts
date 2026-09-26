import { describe, expect, it } from "vitest";
import { pdvNabave, pdvRezimNabave, provjeriZaprimanje, statusNarudzbe } from "./nabava";

describe("nabava", () => {
  it("PDV prema državi dobavljača", () => {
    expect(pdvRezimNabave("DOMACI")).toBe("HR");
    expect(pdvRezimNabave("DOMACI", false)).toBe("BEZ_PDV");
    expect(pdvRezimNabave("EU_OBVEZNIK")).toBe("EU");
    expect(pdvRezimNabave("EU_NEOBVEZNIK")).toBe("HR");
    expect(pdvRezimNabave("TRECA_ZEMLJA")).toBe("UVOZ");
    expect(pdvNabave("HR", 100000)).toEqual({ pdv: 25000, naPlatiti: 125000, pretporez: 25000, samooporezivanje: 0 });
    expect(pdvNabave("EU", 100000)).toEqual({ pdv: 0, naPlatiti: 100000, pretporez: 25000, samooporezivanje: 25000 });
    expect(pdvNabave("UVOZ", 100000)).toEqual({ pdv: 0, naPlatiti: 100000, pretporez: 0, samooporezivanje: 0 });
    expect(pdvNabave("BEZ_PDV", 100000).naPlatiti).toBe(100000);
  });
  it("zaprimanje ne prelazi naručeno; djelomično je dopušteno", () => {
    const s = [
      { id: "a", kolicina: 5, zaprimljeno: 3 },
      { id: "b", kolicina: 2, zaprimljeno: 0 },
    ];
    expect(provjeriZaprimanje(s, new Map([["a", 2]]))).toBeNull();
    expect(provjeriZaprimanje(s, new Map([["a", 3]]))).toContain("više nego što je naručeno");
    expect(provjeriZaprimanje(s, new Map([["c", 1]]))).toContain("nije na narudžbenici");
    expect(provjeriZaprimanje(s, new Map([["a", 0]]))).toContain("barem jedan");
    expect(provjeriZaprimanje(s, new Map([["b", -1]]))).toContain("nije ispravna");
  });
  it("status narudžbenice", () => {
    expect(statusNarudzbe("OTVORENA", [{ kolicina: 2, zaprimljeno: 0 }])).toBe("OTVORENA");
    expect(statusNarudzbe("OTVORENA", [{ kolicina: 2, zaprimljeno: 1 }])).toBe("DJELOMICNO");
    expect(statusNarudzbe("DJELOMICNO", [{ kolicina: 2, zaprimljeno: 2 }])).toBe("ZAPRIMLJENA");
    expect(statusNarudzbe("ZATVORENA", [{ kolicina: 2, zaprimljeno: 1 }])).toBe("ZATVORENA");
  });
});
