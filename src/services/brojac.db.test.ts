import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { postaviPocetniBroj, sljedeciBrojSDatumom } from "./brojac";
import { pravaClana } from "./korisnici";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const izdaj = (firmaId: string, datum: string, danas = "2026-09-25", dospijece?: string) =>
  prisma.$transaction((tx) => sljedeciBrojSDatumom(tx, firmaId, "racun:PP1:1", { datum, danas, dospijece }));

describe("brojač s datumom", () => {
  it("8 istovremenih izdavanja: brojevi 1–8 bez duplih i bez rupa", async () => {
    const f = await napraviFirmu(prisma);
    const r = await Promise.all(Array.from({ length: 8 }, () => izdaj(f.id, "2026-09-25")));
    expect([...r].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("neuspjela transakcija ne troši broj; datum prije zadnjeg u godini odbijen; nova godina od 1", async () => {
    const f = await napraviFirmu(prisma);
    expect(await izdaj(f.id, "2026-09-20")).toBe(1);
    await expect(
      prisma.$transaction(async (tx) => {
        await sljedeciBrojSDatumom(tx, f.id, "racun:PP1:1", { datum: "2026-09-21", danas: "2026-09-25" });
        throw new Error("pad nakon broja");
      }),
    ).rejects.toThrow("pad nakon broja");
    expect(await izdaj(f.id, "2026-09-21")).toBe(2);
    await expect(izdaj(f.id, "2026-09-19")).rejects.toThrow("prije zadnjeg izdanog");
    await expect(izdaj(f.id, "2026-09-26")).rejects.toThrow("budućnosti");
    await expect(izdaj(f.id, "2026-09-25", "2026-09-25", "2026-09-24")).rejects.toThrow("Dospijeće");
    // račun od 31.12. ne blokira novu godinu
    expect(await izdaj(f.id, "2025-12-31", "2026-01-02")).toBe(1);
    expect(await izdaj(f.id, "2026-09-22")).toBe(3);
    // druga firma ima svoj niz
    expect(await izdaj((await napraviFirmu(prisma, "Druga")).id, "2026-09-25")).toBe(1);
  });

  it("početni broj samo naprijed", async () => {
    const f = await napraviFirmu(prisma);
    const k = await napraviKorisnika(prisma, f.id);
    const A = { firmaId: f.id, korisnikId: k.id, prava: (await pravaClana(prisma, f.id, k.id))! };
    await postaviPocetniBroj(prisma, A, "racun:PP1:1", 2026, 150);
    expect(await izdaj(f.id, "2026-09-25")).toBe(150);
    await expect(postaviPocetniBroj(prisma, A, "racun:PP1:1", 2026, 100)).rejects.toThrow("Već je izdan broj 150");
    await postaviPocetniBroj(prisma, A, "racun:PP1:1", 2026, 200);
    expect(await izdaj(f.id, "2026-09-25")).toBe(200);
  });
});
