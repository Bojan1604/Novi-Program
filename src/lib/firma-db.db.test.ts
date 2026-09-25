import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { sFirmom } from "./firma-db";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function dvijeFirme() {
  const a = await napraviFirmu(prisma, "Firma A");
  const b = await napraviFirmu(prisma, "Firma B");
  const ka = await napraviKorisnika(prisma, a.id);
  const kb = await napraviKorisnika(prisma, b.id);
  return { a, b, ka, kb, dbA: sFirmom(prisma, a.id) };
}

describe("izolacija firmi: firma A ne vidi i ne mijenja firmu B", () => {
  it("čitanje", async () => {
    const { a, b, dbA } = await dvijeFirme();
    const svi = await dbA.clanstvoFirme.findMany();
    expect(svi.map((c) => c.firmaId)).toEqual([a.id]);
    expect(await dbA.clanstvoFirme.count()).toBe(1);
    expect(await dbA.clanstvoFirme.findMany({ where: { firmaId: b.id } })).toEqual([]);
  });

  it("dohvat tuđeg zapisa po id-u", async () => {
    const { b, dbA } = await dvijeFirme();
    const tudje = await prisma.clanstvoFirme.findFirstOrThrow({ where: { firmaId: b.id } });
    expect(await dbA.clanstvoFirme.findUnique({ where: { id: tudje.id } })).toBeNull();
    await expect(dbA.clanstvoFirme.findUniqueOrThrow({ where: { id: tudje.id } })).rejects.toThrow();
  });

  it("promjena i brisanje tuđeg zapisa ne uspijevaju", async () => {
    const { b, dbA } = await dvijeFirme();
    const tudje = await prisma.clanstvoFirme.findFirstOrThrow({ where: { firmaId: b.id } });
    await expect(dbA.clanstvoFirme.update({ where: { id: tudje.id }, data: { aktivno: false } })).rejects.toThrow();
    expect((await dbA.clanstvoFirme.updateMany({ where: { id: tudje.id }, data: { aktivno: false } })).count).toBe(0);
    expect((await dbA.clanstvoFirme.deleteMany({ where: { id: tudje.id } })).count).toBe(0);
    await expect(dbA.clanstvoFirme.delete({ where: { id: tudje.id } })).rejects.toThrow();
    expect((await prisma.clanstvoFirme.findUniqueOrThrow({ where: { id: tudje.id } })).aktivno).toBe(true);
  });

  it("stvaranje ide u vlastitu firmu; u tuđu je zabranjeno", async () => {
    const { a, b, kb, dbA } = await dvijeFirme();
    const novi = await dbA.clanstvoFirme.create({ data: { korisnikId: kb.id, firmaId: a.id, ulogaId: a.uloge["Prodavač"]! } });
    expect(novi.firmaId).toBe(a.id);
    await expect(dbA.clanstvoFirme.create({ data: { korisnikId: kb.id, firmaId: b.id, ulogaId: b.uloge["Prodavač"]! } })).rejects.toThrow(
      /drugoj firmi/,
    );
  });

  it("zbrojevi i grupiranje vide samo vlastitu firmu", async () => {
    const { dbA } = await dvijeFirme();
    const g = await dbA.clanstvoFirme.groupBy({ by: ["firmaId"], _count: true });
    expect(g).toHaveLength(1);
  });

  it("baza odbija vezu na zapis druge firme (složeni ključ)", async () => {
    const { a, b, kb } = await dvijeFirme();
    await expect(prisma.clanstvoFirme.create({ data: { firmaId: a.id, korisnikId: kb.id, ulogaId: b.uloge["Prodavač"]! } })).rejects.toThrow(
      /Foreign key|foreign key|constraint/i,
    );
    const dbA = sFirmom(prisma, a.id);
    await expect(dbA.clanstvoFirme.create({ data: { firmaId: a.id, korisnikId: kb.id, ulogaId: b.uloge["Prodavač"]! } })).rejects.toThrow(
      /Foreign key|foreign key|constraint/i,
    );
  });

  it("transakcija na klijentu firme ostaje ograničena", async () => {
    const { dbA } = await dvijeFirme();
    const broj = await dbA.$transaction(async (tx) => tx.clanstvoFirme.count());
    expect(broj).toBe(1);
  });
});
