import { danas } from "../../src/domain/datum";
import { otvoriInventuru, skenirajUInventuru, zakljuciInventuru } from "../../src/services/inventure";
import { pravaClana, type Akter } from "../../src/services/korisnici";
import { izdajDokument, odluciOZahtjevu } from "../../src/services/skladisni-dokumenti";
import type { DemoKontekst } from "./index";

/** Međuskladišnica, odobren i čekajući izlaz, zaključena i otvorena inventura — kroz iste servise kao program. */
export async function demoSkladiste(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId } = k;
  const akter = async (uloga: string): Promise<Akter> => {
    const korisnikId = k.korisnici[uloga] ?? k.korisnici["Administrator"]!;
    return { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
  };
  const skladistar = await akter("Skladištar");
  const voditelj = await akter("Voditelj");
  const skladista = await prisma.skladiste.findMany({ where: { firmaId, aktivan: true }, orderBy: { naziv: "asc" }, select: { id: true } });
  if (skladista.length < 2) return;
  const [a, b] = [skladista[0]!.id, skladista[1]!.id];
  const naSkladistu = (skladisteId: string, n: number) =>
    prisma.uredaj
      .findMany({ where: { firmaId, skladisteId, stanje: "NA_SKLADISTU" }, orderBy: { serijski: "asc" }, take: n, select: { serijski: true } })
      .then((l) => l.map((u) => u.serijski));
  const dan = danas();
  const osnova = { datum: dan, partnerId: null, napomena: null };

  const zaPremjestaj = await naSkladistu(a, 5);
  if (zaPremjestaj.length)
    await izdajDokument(prisma, skladistar, {
      ...osnova,
      vrsta: "MEDJUSKLADISNICA",
      skladisteIzId: a,
      skladisteUId: b,
      razlog: null,
      serijski: zaPremjestaj,
    });

  const zaIzlaz = await naSkladistu(a, 4);
  if (zaIzlaz.length >= 4) {
    await izdajDokument(prisma, skladistar, {
      ...osnova,
      vrsta: "IZLAZ",
      skladisteIzId: a,
      skladisteUId: null,
      razlog: "Oštećen",
      serijski: zaIzlaz.slice(0, 2),
    });
    const o = await prisma.odobrenje.findFirstOrThrow({ where: { firmaId, status: "CEKA" } });
    await odluciOZahtjevu(prisma, voditelj, o.id, true, null);
    // drugi izlaz ostaje na čekanju (vidi se u Odobrenjima)
    await izdajDokument(prisma, skladistar, {
      ...osnova,
      vrsta: "IZLAZ",
      skladisteIzId: a,
      skladisteUId: null,
      razlog: "Zastario",
      serijski: zaIzlaz.slice(2),
    });
  }

  // zaključena inventura skladišta b: sve osim jednog pronađeno + jedan nepoznat
  const naB = await prisma.uredaj.findMany({ where: { firmaId, skladisteId: b }, select: { serijski: true }, take: 300 });
  const inv = await otvoriInventuru(prisma, skladistar, { skladisteId: b, datum: dan, napomena: "Godišnja inventura" });
  await skenirajUInventuru(prisma, skladistar, inv.id, [...naB.slice(1).map((u) => u.serijski), "NEPOZNAT-DEMO-1"]);
  await zakljuciInventuru(prisma, skladistar, inv.id);
  await otvoriInventuru(prisma, skladistar, { skladisteId: a, datum: dan, napomena: null });
  k.log(`Skladišni dokumenti i inventure: ${inv.broj}`);
}
