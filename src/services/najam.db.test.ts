import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { otkaziUgovor, spremiUgovor, type UlazUgovora } from "./najam";
import { dodajPriloge } from "./prilozi";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const k = await napraviKorisnika(prisma, firma.id, { uloga: "Voditelj" });
  const A: Akter = { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! };
  const kupac = await prisma.partner.create({ data: { firmaId: firma.id, naziv: "Najmoprimac d.o.o.", oib: "69435151530" } });
  const ulaz = (x: Partial<UlazUgovora> = {}): UlazUgovora => ({
    partnerId: kupac.id,
    poslovnicaId: null,
    od: "2026-01-01",
    do: null,
    rucniBroj: null,
    rokPlacanjaDana: 15,
    nacinPlacanja: "T",
    uvjeti: "Otkazni rok 30 dana",
    napomenaRacuna: null,
    verzija: 0,
    ...x,
  });
  const novi = async (x: Partial<UlazUgovora> = {}) => {
    const r = await spremiUgovor(prisma, A, null, ulaz(x));
    if (!r.ok) throw new Error(JSON.stringify(r.polja));
    return prisma.ugovorNajma.findUniqueOrThrow({ where: { id: r.id } });
  };
  return { firma, A, kupac, ulaz, novi };
}

describe("ugovor o najmu", () => {
  it("automatski broj; ručni ne troši brojač; automatski preskače broj zauzet ručno", async () => {
    const { novi, ulaz, A } = await pripremi();
    expect((await novi()).broj).toBe("NU-1/2026");
    const r = await novi({ rucniBroj: "NU-2/2026" });
    expect([r.broj, r.redni]).toEqual(["NU-2/2026", null]);
    expect((await novi()).broj).toBe("NU-3/2026");
    expect((await novi({ rucniBroj: "Papir 7/2019" })).broj).toBe("Papir 7/2019");
    expect((await novi()).broj).toBe("NU-4/2026");
    expect(await spremiUgovor(prisma, A, null, ulaz({ rucniBroj: "Papir 7/2019" }))).toEqual({
      ok: false,
      polja: { broj: "Taj broj već ima drugi ugovor." },
    });
  });

  it("izmjena: verzija, promjena kraja, dnevnik s razlikama; neispravan upis vraća greške polja", async () => {
    const { novi, ulaz, A, firma } = await pripremi();
    const u = await novi();
    expect(await spremiUgovor(prisma, A, u.id, ulaz({ do: "2026-12-31", verzija: 0 }))).toEqual({ ok: true, id: u.id });
    await expect(spremiUgovor(prisma, A, u.id, ulaz({ do: "2027-12-31", verzija: 0 }))).rejects.toThrow("u međuvremenu");
    const d = await prisma.dnevnik.findFirstOrThrow({ where: { firmaId: firma.id, entitetId: u.id, opis: { startsWith: "Izmijenjen" } } });
    expect(JSON.stringify(d)).toContain("2026-12-31");
    const r = await spremiUgovor(prisma, A, null, ulaz({ od: "2026-05-01", do: "2026-04-01" }));
    expect(r.ok ? null : r.polja["do"]).toContain("prije početka");
    expect(await spremiUgovor(prisma, A, null, ulaz({ partnerId: "nije-uuid" }))).toMatchObject({
      ok: false,
      polja: { partnerId: "Odaberite kupca." },
    });
  });

  it("otkaz i poništavanje otkaza; otkaz prije početka nije moguć", async () => {
    const { novi, A } = await pripremi();
    const u = await novi({ od: "2026-03-01" });
    await expect(otkaziUgovor(prisma, A, u.id, "2026-02-01", null)).rejects.toThrow("prije početka");
    await otkaziUgovor(prisma, A, u.id, "2026-06-30", "Kupac zatvara ured");
    expect(await prisma.ugovorNajma.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ razlogOtkaza: "Kupac zatvara ured" });
    await otkaziUgovor(prisma, A, u.id, null, null);
    expect(await prisma.ugovorNajma.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ otkazan: null, razlogOtkaza: null });
  });

  it("prilog potpisanog ugovora; druga firma ne vidi ugovor", async () => {
    const { novi, A } = await pripremi();
    const u = await novi();
    expect(
      await dodajPriloge(prisma, A, "UgovorNajma", u.id, [{ naziv: "potpisan.pdf", velicina: 8, sadrzaj: new TextEncoder().encode("%PDF-1.4") }]),
    ).toBe(1);
    const druga = await napraviFirmu(prisma);
    const k2 = await napraviKorisnika(prisma, druga.id, { uloga: "Administrator" });
    const B: Akter = { firmaId: druga.id, korisnikId: k2.id, prava: (await pravaClana(prisma, druga.id, k2.id))! };
    await expect(otkaziUgovor(prisma, B, u.id, "2026-06-30", null)).rejects.toThrow("Ugovor ne postoji.");
    await expect(
      dodajPriloge(prisma, B, "UgovorNajma", u.id, [{ naziv: "x.pdf", velicina: 8, sadrzaj: new TextEncoder().encode("%PDF-1.4") }]),
    ).rejects.toThrow("Zapis ne postoji.");
  });
});
