import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { napuniDemo } from "../../prisma/demo";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma, testniOib } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { brojRedaka, dnevneKopije, GLOBALNO_JEDINSTVENI, izradiKopiju, izradiSadrzaj, katalog, procitajKopiju, vratiUNovuFirmu } from "./kopije";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

/** zbroj svih brojčanih stupaca po tablici (iznosi, količine, veličine) */
async function brojevi(firmaId: string): Promise<Record<string, string>> {
  const stupci = await prisma.$queryRaw<{ t: string; s: string }[]>`
    SELECT table_name AS t, column_name AS s FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type IN ('integer', 'bigint', 'numeric', 'smallint', 'double precision')
      AND table_name IN (SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'firmaId')
      AND table_name NOT IN ('Sesija', 'SesijaPortala', 'SigurnosnaKopija', 'ClanstvoFirme', 'Dnevnik')
    ORDER BY 1, 2`;
  const r: Record<string, string> = {};
  for (const { t, s } of stupci) {
    const [x] = await prisma.$queryRawUnsafe<{ z: string | null }[]>(`SELECT sum("${s}")::text AS z FROM "${t}" WHERE "firmaId" = $1::uuid`, firmaId);
    if (x?.z != null) r[`${t}.${s}`] = x.z;
  }
  return r;
}

async function pripremi() {
  const d = await napuniDemo(prisma, { uredaja: 30, partnera: 6, racuna: 8, ugovora: 2 }, () => {});
  const firmaId = d.firmaId;
  const korisnikId = d.korisnici["Administrator"]!;
  const A: Akter = { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))!, ip: null };
  // dodatno: bajtovi (logo, prilog), MDM stablo (veza na samu sebe), portal s poveznicom, JSON s id-em
  const logo = await prisma.logoFirme.create({ data: { firmaId, vrsta: "image/png", sadrzaj: Buffer.from([137, 80, 78, 71, 0, 1, 2, 255]) } });
  await prisma.firma.update({ where: { id: firmaId }, data: { logoId: logo.id, fiskalNacin: "PRODUKCIJA" } });
  const partner = await prisma.partner.findFirstOrThrow({ where: { firmaId }, orderBy: { naziv: "asc" } });
  await prisma.prilog.create({
    data: {
      firmaId,
      entitet: "Partner",
      entitetId: partner.id,
      naziv: "ugovor.pdf",
      vrsta: "application/pdf",
      velicina: 4,
      sadrzaj: Buffer.from("%PDF"),
    },
  });
  const d1 = await prisma.mdmOrganizacija.create({
    data: { firmaId, naziv: "Distributer", vrsta: "DISTRIBUTER", kodUpisa: "KOD-D1", partnerId: partner.id },
  });
  const k1 = await prisma.mdmOrganizacija.create({ data: { firmaId, naziv: "Klijent", vrsta: "KLIJENT", kodUpisa: "KOD-K1", nadredenaId: d1.id } });
  await prisma.mdmUredaj.create({ data: { firmaId, organizacijaId: k1.id, serijski: "TAB-1", platforma: "ANDROID", tokenHash: "h".repeat(64) } });
  await prisma.korisnikPortala.create({
    data: {
      firmaId,
      partnerId: partner.id,
      ime: "Klijent",
      email: "k@x.hr",
      lozinkaHash: "x",
      poveznicaHash: "p".repeat(64),
      poveznicaIstice: new Date(),
    },
  });
  await prisma.dnevnik.create({
    data: {
      firmaId,
      korisnik: "Test",
      radnja: "test",
      entitet: "Partner",
      entitetId: partner.id,
      opis: "x",
      promjene: [{ polje: "partnerId", staro: null, novo: partner.id }],
      pretraga: "x",
    },
  });
  return { d, firmaId, A, partner, logo };
}

describe("sigurnosne kopije", () => {
  it("vraćena kopija = izvor (broj redaka i zbrojevi po tablici); izvorna firma netaknuta; veze i JSON na nove id-eve", async () => {
    const { d, firmaId, A, partner } = await pripremi();
    const prijeRedaka = await brojRedaka(prisma, firmaId);
    const prijeBrojeva = await brojevi(firmaId);
    const drugaPrije = await brojRedaka(prisma, d.drugaFirmaId);
    expect(Object.keys(prijeRedaka).length).toBeGreaterThan(15);

    const k = await izradiKopiju(prisma, firmaId, "RUCNA", A);
    const kopija = await prisma.sigurnosnaKopija.findUniqueOrThrow({ where: { id: k.id } });
    const oib = testniOib();
    const v = await vratiUNovuFirmu(prisma, A, kopija.sadrzaj, { naziv: "Vraćena d.o.o.", oib });

    const n = v.firmaId;
    const poslije = await brojRedaka(prisma, n);
    expect({ ...poslije, Dnevnik: poslije["Dnevnik"]! - 1 }).toEqual(prijeRedaka);
    expect(await brojevi(n)).toEqual(prijeBrojeva);
    // izvor: samo zapis o izradi kopije i o vraćanju u dnevniku
    expect(await brojRedaka(prisma, firmaId)).toEqual({ ...prijeRedaka, Dnevnik: prijeRedaka["Dnevnik"]! + 2 });
    expect(await brojRedaka(prisma, d.drugaFirmaId)).toEqual(drugaPrije);

    const f = await prisma.firma.findUniqueOrThrow({ where: { id: n } });
    expect(f).toMatchObject({ naziv: "Vraćena d.o.o.", oib, fiskalNacin: "DEMO" });
    const logo = await prisma.logoFirme.findUniqueOrThrow({ where: { id: f.logoId! } });
    expect(logo.firmaId).toBe(n);
    expect([...logo.sadrzaj]).toEqual([137, 80, 78, 71, 0, 1, 2, 255]);
    expect(Buffer.from((await prisma.prilog.findFirstOrThrow({ where: { firmaId: n } })).sadrzaj).toString()).toBe("%PDF");

    const noviPartner = await prisma.partner.findFirstOrThrow({ where: { firmaId: n, naziv: partner.naziv, oib: partner.oib } });
    expect(noviPartner.id).not.toBe(partner.id);
    const kl = await prisma.mdmOrganizacija.findFirstOrThrow({ where: { firmaId: n, naziv: "Klijent" }, include: { nadredena: true } });
    expect(kl.nadredena).toMatchObject({ firmaId: n, naziv: "Distributer", partnerId: noviPartner.id });
    expect(kl.kodUpisa).not.toBe("KOD-K1");
    expect(await prisma.mdmUredaj.findFirstOrThrow({ where: { firmaId: n } })).toMatchObject({ ponovniUpis: true });
    expect((await prisma.mdmUredaj.findFirstOrThrow({ where: { firmaId: n } })).tokenHash).not.toBe("h".repeat(64));
    expect(await prisma.korisnikPortala.findFirstOrThrow({ where: { firmaId: n } })).toMatchObject({
      poveznicaHash: null,
      lozinkaHash: null,
      aktivan: false,
      partnerId: noviPartner.id,
    });
    const dn = await prisma.dnevnik.findFirstOrThrow({ where: { firmaId: n, radnja: "test" } });
    expect(dn.entitetId).toBe(noviPartner.id);
    expect(dn.promjene).toEqual([{ polje: "partnerId", staro: null, novo: noviPartner.id }]);

    // svaki prodajni dokument pokazuje na partnera iste (nove) firme
    const racuni = await prisma.prodajniDokument.findMany({ where: { firmaId: n, partnerId: { not: null } }, select: { partnerId: true } });
    expect(racuni.length).toBeGreaterThan(0);
    const partneriNove = new Set((await prisma.partner.findMany({ where: { firmaId: n }, select: { id: true } })).map((p) => p.id));
    for (const r of racuni) expect(partneriNove.has(r.partnerId!)).toBe(true);

    // onaj tko vraća je administrator nove firme
    expect((await pravaClana(prisma, n, A.korisnikId))?.moduli["postavke"]).toBe("puno");
    expect(await prisma.clanstvoFirme.count({ where: { firmaId: n } })).toBe(1);

    await expect(vratiUNovuFirmu(prisma, A, kopija.sadrzaj, { naziv: "Opet", oib })).rejects.toThrow("već postoji");
  }, 120_000);

  it("učitana kopija: oštećena, odrezana ili s vezom na tuđe zapise se odbija", async () => {
    const f = await napraviFirmu(prisma, "Izvor");
    const druga = await napraviFirmu(prisma, "Tuđa");
    const kor = await napraviKorisnika(prisma, f.id);
    const A: Akter = { firmaId: f.id, korisnikId: kor.id, prava: (await pravaClana(prisma, f.id, kor.id))!, ip: null };
    const tudi = await prisma.partner.create({ data: { firmaId: druga.id, naziv: "Tajni partner" } });
    const moj = await prisma.partner.create({ data: { firmaId: f.id, naziv: "Moj" } });
    await prisma.poslovnica.create({ data: { firmaId: f.id, partnerId: moj.id, naziv: "PJ" } });
    const { sadrzaj } = await izradiSadrzaj(prisma, f.id);

    expect(() => procitajKopiju(strToU8("nije gzip"))).toThrow("nije sigurnosna kopija");
    const linije = strFromU8(gunzipSync(sadrzaj)).trimEnd().split("\n");
    expect(() => procitajKopiju(gzipSync(strToU8(linije.slice(0, -2).join("\n"))))).toThrow("oštećena");
    const podmetnuto = linije.map((l) => l.replaceAll(moj.id, tudi.id)).join("\n");
    // partner je u kopiji s tuđim id-em pa bi se preslikao; poslovnica koja pokazuje na id koji nije u kopiji se odbija
    const samoPoslovnica = linije
      .filter((l) => !l.startsWith('{"m":"Partner"'))
      .map((l) => (l.startsWith('{"kraj"') ? l.replace(/"Partner":\d+,?/, "") : l));
    await expect(
      vratiUNovuFirmu(prisma, A, gzipSync(strToU8(samoPoslovnica.map((l) => l.replaceAll(moj.id, tudi.id)).join("\n"))), {
        naziv: "X",
        oib: testniOib(),
      }),
    ).rejects.toThrow("pokazuje izvan kopije");
    // ni preslikani tuđi id ne dohvaća tuđi zapis: dobije novi id u novoj firmi
    const v = await vratiUNovuFirmu(prisma, A, gzipSync(strToU8(podmetnuto)), { naziv: "Y", oib: testniOib() });
    expect(await prisma.partner.count({ where: { id: tudi.id, firmaId: druga.id } })).toBe(1);
    expect((await prisma.poslovnica.findFirstOrThrow({ where: { firmaId: v.firmaId }, include: { partner: true } })).partner.firmaId).toBe(v.firmaId);
    expect(await prisma.firma.count()).toBe(3);
  });

  it("dnevne kopije: poslije 02:00, jednom na dan; čuva se zadnjih 7", async () => {
    const f = await napraviFirmu(prisma);
    expect((await dnevneKopije(prisma, new Date("2026-03-10T00:30:00Z"))).izradeno).toBe(0); // 01:30 u Zagrebu
    for (let dan = 1; dan <= 9; dan++) {
      const sada = new Date(`2026-03-${String(dan).padStart(2, "0")}T03:00:00Z`);
      expect((await dnevneKopije(prisma, sada)).izradeno).toBe(1);
      expect((await dnevneKopije(prisma, new Date(sada.getTime() + 3600_000))).izradeno).toBe(0);
    }
    const kopije = await prisma.sigurnosnaKopija.findMany({ where: { firmaId: f.id }, orderBy: { vrijeme: "asc" } });
    expect(kopije).toHaveLength(7);
    expect(kopije[0]!.vrijeme.toISOString()).toBe("2026-03-03T03:00:00.000Z");
    expect(kopije.every((k) => k.vrsta === "DNEVNA" && k.korisnik === "Sustav")).toBe(true);
  });

  it("katalog: svaki jedinstveni indeks bez firmaId je poznat vraćanju", async () => {
    await katalog(prisma);
    const indeksi = await prisma.$queryRaw<{ t: string; s: string }[]>`
      SELECT c.relname AS t, string_agg(a.attname, ',' ORDER BY k.ord) AS s
      FROM pg_index x JOIN pg_class c ON c.oid = x.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL unnest(x.indkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public' AND x.indisunique AND NOT x.indisprimary
        AND EXISTS (SELECT 1 FROM pg_attribute f WHERE f.attrelid = c.oid AND f.attname = 'firmaId')
        AND NOT EXISTS (SELECT 1 FROM pg_attribute f WHERE f.attrelid = c.oid AND f.attname = 'firmaId' AND f.attnum = ANY (x.indkey))
      GROUP BY c.relname, x.indexrelid`;
    expect(new Set(indeksi.map((i) => `${i.t}.${i.s}`))).toEqual(GLOBALNO_JEDINSTVENI);
  });
});
