/** Popis stranica za mjerenje brzine (7.2) i snimke izgleda (7.3). */
/**
 * Sve stranice iz izbornika (+ ?velicina=200 za popise) i po jedna kartica svake vrste — id-evi iz baze
 * (DATABASE_URL), iz firme korisnika za mjerenje.
 */
export async function svePutanje(): Promise<string[]> {
  const { STRANICE } = await import("../../src/lib/akcije-prava");
  const { IZVJESTAJI } = await import("../../src/lib/izvjestaji");
  const { napraviPrismu } = await import("../../src/lib/prisma");
  const prisma = napraviPrismu(process.env["DATABASE_URL"] ?? "");
  try {
    const email = process.env["MJERENJE_EMAIL"] ?? "admin@demo.hr";
    const c = await prisma.clanstvoFirme.findFirstOrThrow({
      where: { korisnik: { email } },
      orderBy: { stvoreno: "asc" },
      select: { firmaId: true },
    });
    const f = c.firmaId;
    const prvi = async (upit: Promise<{ id: string } | null>, put: (id: string) => string) => {
      const r = await upit;
      return r ? [put(r.id)] : [];
    };
    const uzmi = { select: { id: true }, orderBy: { id: "desc" as const } };
    const kartice = (
      await Promise.all([
        prvi(prisma.uredaj.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/uredaji/${id}`),
        prvi(prisma.prodajniDokument.findFirst({ where: { firmaId: f, vrsta: "RACUN", status: "IZDAN" }, ...uzmi }), (id) => `/racuni/${id}`),
        prvi(prisma.prodajniDokument.findFirst({ where: { firmaId: f, vrsta: "PONUDA" }, ...uzmi }), (id) => `/ponude/${id}`),
        prvi(prisma.partner.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/partneri/${id}`),
        prvi(prisma.ugovorNajma.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/najam/${id}`),
        prvi(prisma.ugovorNajma.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/najam/${id}/raspored`),
        prvi(prisma.servisniNalog.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/servis/${id}`),
        prvi(prisma.narudzbenica.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/nabava/${id}`),
        prvi(prisma.ulazniRacun.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/ulazni/${id}`),
        prvi(prisma.primka.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/primke/${id}`),
        prvi(prisma.skladisniDokument.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/skladisni/${id}`),
        prvi(prisma.inventura.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/inventure/${id}`),
        prvi(prisma.cjenik.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/cjenici/${id}`),
        prvi(prisma.trosak.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/troskovi/${id}`),
        prvi(prisma.mdmOrganizacija.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/mdm/${id}`),
        prvi(prisma.mdmUredaj.findFirst({ where: { firmaId: f }, ...uzmi }), (id) => `/mdm/uredaji/${id}`),
      ])
    ).flat();
    const popisi = ["/uredaji", "/racuni", "/partneri", "/najam", "/servis", "/primke", "/dnevnik", "/troskovi", "/ulazni", "/nabava"].map(
      (p) => `${p}?velicina=200`,
    );
    const izvjestaji = IZVJESTAJI.map((i) => `/izvjestaji/${i.kljuc}`);
    return ["/", ...Object.keys(STRANICE), ...popisi, ...izvjestaji, ...kartice];
  } finally {
    await prisma.$disconnect();
  }
}
