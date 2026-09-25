import { afterAll, describe, expect, it } from "vitest";
import { centiIzDecimala } from "@/domain/novac";
import { napraviPrismu } from "./prisma";

const prisma = napraviPrismu();
afterAll(() => prisma.$disconnect());

describe("baza", () => {
  it("povezuje se na testnu bazu", async () => {
    const [red] = await prisma.$queryRaw<{ baza: string }[]>`SELECT current_database() AS baza`;
    expect(red?.baza).toMatch(/test/);
  });

  it("PostgreSQL je verzija 16 ili novija", async () => {
    const [red] = await prisma.$queryRaw<{ verzija: number }[]>`SELECT current_setting('server_version_num')::int AS verzija`;
    expect(red?.verzija).toBeGreaterThanOrEqual(160000);
  });

  it("Decimal(14,2) čuva iznose točno (bez floata)", async () => {
    const [red] = await prisma.$queryRaw<{ zbroj: { toString(): string } }[]>`
      SELECT (0.10::numeric(14,2) + 0.20::numeric(14,2))::numeric(14,2) AS zbroj`;
    expect(centiIzDecimala(red!.zbroj.toString())).toBe(30);
  });
});
