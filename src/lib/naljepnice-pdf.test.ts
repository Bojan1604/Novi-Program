import { describe, expect, it } from "vitest";
import { FORMATI } from "@/domain/naljepnice";
import { pdfNaljepnica } from "./naljepnice-pdf";

const stranice = (b: Buffer) => (b.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
const mediaBox = (b: Buffer) => /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(b.toString("latin1"))!.slice(1).map(Number);
const n = (broj: number) =>
  Array.from({ length: broj }, (_, i) => ({ serijski: `PF3ABC${100 + i}`, naziv: "Lenovo ThinkPad T14 Gen 4 s vrlo dugim nazivom modela" }));

describe("PDF naljepnica", () => {
  it("A4 3×8: 25 naljepnica = 2 stranice A4", async () => {
    const b = await pdfNaljepnica(FORMATI["a4-3x8"], n(25), "https://erp.primjer.hr");
    expect(stranice(b)).toBe(2);
    const [w, h] = mediaBox(b);
    expect(w).toBeCloseTo((210 * 72) / 25.4, 0);
    expect(h).toBeCloseTo((297 * 72) / 25.4, 0);
  });
  it("početak na 24. mjestu: 2 naljepnice = 2 stranice", async () => {
    expect(stranice(await pdfNaljepnica(FORMATI["a4-3x8"], n(2), "https://x", 24))).toBe(2);
  });
  it("printer naljepnica 62×29: stranica po naljepnici, veličina papira = naljepnica", async () => {
    const b = await pdfNaljepnica(FORMATI["traka-62x29"], n(3), "https://x");
    expect(stranice(b)).toBe(3);
    const [w, h] = mediaBox(b);
    expect(w).toBeCloseTo((62 * 72) / 25.4, 0);
    expect(h).toBeCloseTo((29 * 72) / 25.4, 0);
  });
});
