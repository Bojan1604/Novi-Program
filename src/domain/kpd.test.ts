import { describe, expect, it } from "vitest";
import { jeKpd, procitajKpd } from "./kpd";

describe("KPD", () => {
  it.each([
    ["26.20.11", "26.20.11"],
    ["262011", "26.20.11"],
    [" 77.33.11 ", "77.33.11"],
  ])("„%s“ → %s", (u, v) => expect(procitajKpd(u)).toEqual({ ok: true, vrijednost: v }));

  it.each(["", "26.20", "26.20.1", "2620111", "26-20-11", "2.62.011", "ab.cd.ef"])("„%s“ → greška", (u) => {
    expect(procitajKpd(u).ok).toBe(false);
  });

  it("jeKpd", () => {
    expect(jeKpd("26.20.11")).toBe(true);
    expect(jeKpd("262011")).toBe(false);
  });
});
