import { danas, datum as uDatum, dodajDane, razlikaUDanima } from "../../src/domain/datum";
import { mjesecOd, sljedeciMjesec } from "../../src/domain/najam";
import { pravaClana, type Akter } from "../../src/services/korisnici";
import { dodajUredajeNaUgovor, izdajRate, oznaciNaplacenoDo, spremiUgovor } from "../../src/services/najam";
import type { DemoKontekst } from "./index";

/** najviše toliko ugovora dobiva račun rata iz programa (ostali su naplaćeni „izvan programa“ do prošlog mjeseca) */
const NAJVISE_RACUNA_RATA = 40;

/**
 * Ugovori o najmu kroz iste servise kao program: ugovor → uređaji sa skladišta → stare rate „naplaćene izvan programa“,
 * a dio ugovora dobiva i račun rata za tekući mjesec. Počeci su kronološki, 1–18 mjeseci unatrag.
 */
export async function demoNajam(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId, s } = k;
  const korisnikId = k.korisnici["Voditelj"] ?? k.korisnici["Administrator"]!;
  const A: Akter = { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
  const brojUgovora = k.kolicine.ugovora;
  const kupci = await prisma.partner.findMany({
    where: { firmaId, kupac: true, aktivan: true, drzava: "HR" },
    select: { id: true },
    orderBy: { naziv: "asc" },
    take: Math.max(10, Math.min(500, Math.ceil(brojUgovora / 3))),
  });
  if (!kupci.length || brojUgovora < 1) return;
  // najviše ~30 % zalihe — ostatak treba drugim koracima (servis, nabava…)
  const naSkladistu = await prisma.uredaj.count({ where: { firmaId, stanje: "NA_SKLADISTU" } });
  const zaliha = await prisma.uredaj.findMany({
    where: { firmaId, stanje: "NA_SKLADISTU" },
    orderBy: [{ nabavniDatum: "asc" }, { serijski: "asc" }],
    take: Math.floor(naSkladistu * 0.3),
    select: { serijski: true, nabavniDatum: true },
  });

  const danasnji = danas();
  const ovajMjesec = mjesecOd(danasnji);
  const prosliMjesec = sljedeciMjesec(ovajMjesec, -1);
  // počeci od prije ~18 mjeseci do prije mjesec dana — ali ne prije zaprimanja najstarijeg uređaja iz zalihe
  const prviNabavni = zaliha[0]?.nabavniDatum ? razlikaUDanima(uDatum(zaliha[0].nabavniDatum.toISOString().slice(0, 10)), danasnji) - 1 : 540;
  const najkasnije = Math.min(31, Math.max(0, prviNabavni));
  const najranije = Math.max(najkasnije, Math.min(540, prviNabavni));
  let u = 0;
  let racuna = 0;
  let uredaja = 0;
  for (let i = 0; i < brojUgovora; i++) {
    const od = dodajDane(danasnji, -(najranije - Math.floor((i * (najranije - najkasnije)) / brojUgovora)));
    const r = await spremiUgovor(prisma, A, null, {
      partnerId: s.izaberi(kupci).id,
      poslovnicaId: null,
      od,
      do: s.vjerojatnost(0.3) ? dodajDane(od, 365 * s.cijeli(2, 3) - 1) : null,
      rucniBroj: null,
      rokPlacanjaDana: s.izaberi([8, 15, 15, 30]),
      nacinPlacanja: "T",
      uvjeti: s.vjerojatnost(0.5) ? "Otkazni rok 30 dana. Servis i potrošni materijal uključeni u cijenu." : null,
      napomenaRacuna: null,
      verzija: 0,
    });
    if (!r.ok) throw new Error(`Demo najam: ${JSON.stringify(r.polja)}`);
    // uređaji koji su zaprimljeni prije početka ugovora; ostatak zalihe ravnomjerno na preostale ugovore
    const preostalo = Math.max(1, Math.floor((zaliha.length - u) / (brojUgovora - i)));
    const serijski: string[] = [];
    for (let n = Math.min(s.cijeli(1, 5), preostalo); n > 0 && u < zaliha.length; n--) {
      const x = zaliha[u]!;
      if (x.nabavniDatum && x.nabavniDatum.toISOString().slice(0, 10) > od) break;
      serijski.push(x.serijski);
      u++;
    }
    if (!serijski.length) continue;
    await dodajUredajeNaUgovor(prisma, A, r.id, { serijski, od, cijena: s.cijeli(10, 60) * 100, izvor: "SKLADISTE" });
    uredaja += serijski.length;
    // svaki četvrti ugovor (do granice) ima račun rata iz programa; ostale rate do prošlog mjeseca naplatio je stari program
    const racun = i % 4 === 1 && racuna < NAJVISE_RACUNA_RATA;
    const naplacenoDo = racun ? sljedeciMjesec(ovajMjesec, -2) : prosliMjesec;
    if (mjesecOd(od) <= naplacenoDo) await oznaciNaplacenoDo(prisma, A, r.id, naplacenoDo);
    if (racun) {
      await izdajRate(prisma, A, r.id, ovajMjesec, new Date(`${danasnji}T12:00:00Z`));
      racuna++;
    }
  }
  k.log(`Najam: ${brojUgovora} ugovora, ${uredaja} uređaja, ${racuna} računa rata`);
}
