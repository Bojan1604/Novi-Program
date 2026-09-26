import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { danas, dodajDane } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { imaPravo } from "@/domain/prava";
import type { UlaznaStavka } from "@/domain/prodaja";
import {
  cijenaUMjesecu,
  rateUredaja,
  zaIzdati,
  type Rata,
  jeMjesec,
  kljucRate,
  mjeseci,
  visak,
  mjesecOd,
  provjeriIzmjenuMjeseca,
  provjeriPromjenuCijene,
  sljedeciMjesec,
  type Mjesec,
  type PlanUredaja,
  type UvjetiUgovora,
} from "@/domain/najam";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import { normalizirajSerijski } from "@/domain/stanja-uredaja";
import { brojUgovora, provjeriUgovor, type UnosUgovora } from "@/domain/ugovor-najma";
import { GreskaKorisniku } from "@/lib/greske";
import { sljedeciBroj } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import { pravaClana, type Akter } from "./korisnici";
import { izdajRacunUBazi, porukaFiskalizacije, spremiNacrt } from "./prodaja";
import { promijeniStanje } from "./uredaji";

const najranijiDatum = (...x: (string | null)[]) => x.filter((y): y is string => !!y).sort()[0] ?? null;

type Tx = Prisma.TransactionClient;

export type UlazUgovora = UnosUgovora & {
  partnerId: string;
  poslovnicaId: string | null;
  uvjeti: string | null;
  napomenaRacuna: string | null;
  /** optimističko zaključavanje kod izmjene */
  verzija: number;
};

const d = (x: string) => new Date(`${x}T00:00:00Z`);
const dan = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

async function zakljucajUgovor(tx: Tx, firmaId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "UgovorNajma" WHERE id = ${id}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
  const u = await tx.ugovorNajma.findFirst({ where: { id, firmaId } });
  if (!u) throw new GreskaKorisniku("Ugovor ne postoji.");
  return u;
}

/**
 * Novi ugovor ili izmjena. Ručni broj ne troši brojač; automatski preskače brojeve zauzete ručno.
 * Vraća greške po poljima ili id ugovora.
 */
export async function spremiUgovor(
  db: PrismaClient,
  akter: Akter,
  id: string | null,
  u: UlazUgovora,
): Promise<{ ok: true; id: string } | { ok: false; polja: Record<string, string> }> {
  const polja = provjeriUgovor(u);
  if (!jeUuid(u.partnerId)) polja["partnerId"] = "Odaberite kupca.";
  if (Object.keys(polja).length) return { ok: false, polja };
  if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Ugovor ne postoji.");
  const f = akter.firmaId;
  return db.$transaction(async (tx): Promise<{ ok: true; id: string } | { ok: false; polja: Record<string, string> }> => {
    const partner = await tx.partner.findFirst({ where: { id: u.partnerId, firmaId: f }, select: { aktivan: true, kupac: true } });
    if (!partner?.aktivan || !partner.kupac) return { ok: false as const, polja: { partnerId: "Odaberite aktivnog kupca." } };
    if (u.poslovnicaId && !(await tx.poslovnica.count({ where: { id: u.poslovnicaId, firmaId: f, partnerId: u.partnerId } })))
      return { ok: false as const, polja: { poslovnicaId: "Poslovnica ne pripada kupcu." } };
    const rucni = u.rucniBroj?.trim() || null;
    const podaci = {
      partnerId: u.partnerId,
      poslovnicaId: u.poslovnicaId,
      od: d(u.od),
      do: u.do ? d(u.do) : null,
      rokPlacanjaDana: u.rokPlacanjaDana,
      nacinPlacanja: u.nacinPlacanja,
      uvjeti: u.uvjeti?.trim() || null,
      napomenaRacuna: u.napomenaRacuna?.trim() || null,
    };
    if (id) {
      const stari = await zakljucajUgovor(tx, f, id);
      if (stari.verzija !== u.verzija) throw new GreskaKorisniku("Netko je u međuvremenu promijenio ugovor. Osvježite stranicu.");
      let broj = stari.broj;
      if (rucni && rucni !== stari.broj) {
        if (await tx.ugovorNajma.count({ where: { firmaId: f, broj: rucni, id: { not: id } } }))
          return { ok: false as const, polja: { broj: "Taj broj već ima drugi ugovor." } };
        broj = rucni;
      }
      const novo = await tx.ugovorNajma.update({ where: { id }, data: { ...podaci, broj, verzija: { increment: 1 } } });
      const razlike = Object.fromEntries(
        (["broj", "partnerId", "poslovnicaId", "od", "do", "rokPlacanjaDana", "nacinPlacanja", "uvjeti", "napomenaRacuna"] as const)
          .map(
            (k) =>
              [k, [stari[k] instanceof Date ? dan(stari[k] as Date) : stari[k], novo[k] instanceof Date ? dan(novo[k] as Date) : novo[k]]] as const,
          )
          .filter(([, [a, b]]) => a !== b),
      );
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "najam.ugovor",
        entitet: "UgovorNajma",
        entitetId: id,
        opis: `Izmijenjen ugovor ${broj}`,
        staro: Object.fromEntries(Object.entries(razlike).map(([k, [a]]) => [k, a])),
        novo: Object.fromEntries(Object.entries(razlike).map(([k, [, b]]) => [k, b])),
      });
      return { ok: true as const, id };
    }
    let broj: string;
    let redni: number | null = null;
    let godina: number | null = null;
    if (rucni) {
      if (await tx.ugovorNajma.count({ where: { firmaId: f, broj: rucni } }))
        return { ok: false as const, polja: { broj: "Taj broj već ima drugi ugovor." } };
      broj = rucni;
    } else {
      godina = Number(u.od.slice(0, 4));
      do {
        redni = await sljedeciBroj(tx, f, "ugovorNajma", godina);
        broj = brojUgovora(redni, godina);
      } while (await tx.ugovorNajma.count({ where: { firmaId: f, broj } }));
    }
    const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    const n = await tx.ugovorNajma.create({
      data: { ...podaci, firmaId: f, broj, redni, godina, korisnikId: akter.korisnikId, korisnik: ime },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.ugovor",
      entitet: "UgovorNajma",
      entitetId: n.id,
      opis: `Novi ugovor o najmu ${broj}${rucni ? " (ručni broj)" : ""}`,
    });
    return { ok: true as const, id: n.id };
  });
}

/** Otkaz ugovora od datuma (naplata do tog dana). Poništavanje otkaza: datum null. */
export async function otkaziUgovor(db: PrismaClient, akter: Akter, id: string, datum: string | null, razlog: string | null) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Ugovor ne postoji.");
  if (datum !== null && !/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new GreskaKorisniku("Upišite datum otkaza.");
  await db.$transaction(async (tx) => {
    const u = await zakljucajUgovor(tx, akter.firmaId, id);
    if (datum && datum < dan(u.od)!) throw new GreskaKorisniku("Otkaz ne može biti prije početka ugovora.");
    await tx.ugovorNajma.update({
      where: { id },
      data: { otkazan: datum ? d(datum) : null, razlogOtkaza: datum ? razlog?.trim() || null : null, verzija: { increment: 1 } },
    });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.otkaz",
      entitet: "UgovorNajma",
      entitetId: id,
      opis: datum
        ? `Ugovor ${u.broj} otkazan od ${datum.split("-").reverse().join(".")}.${razlog?.trim() ? ` — ${razlog.trim()}` : ""}`
        : `Poništen otkaz ugovora ${u.broj}`,
      staro: { otkazan: dan(u.otkazan) },
      novo: { otkazan: datum },
    });
  });
}

// ——— uređaji na ugovoru (korak 3.3) ———

const mj = (m: Mjesec) => new Date(`${m}-01T00:00:00Z`);
const uMjesec = (x: Date) => x.toISOString().slice(0, 7);
const centi = (x: Prisma.Decimal) => centiIzDecimala(x.toFixed(2));

/** Podaci ugovora u obliku za motor naplate (domain/najam.ts). */
export async function podaciZaNaplatu(tx: Tx | PrismaClient, firmaId: string, ugovorId: string, stranica?: { skip: number; take: number }) {
  const u = await tx.ugovorNajma.findFirst({ where: { id: ugovorId, firmaId }, select: { od: true, do: true, otkazan: true } });
  if (!u) throw new GreskaKorisniku("Ugovor ne postoji.");
  const planovi = await tx.uredajNaUgovoru.findMany({
    where: { firmaId, ugovorId },
    orderBy: [{ stvoreno: "asc" }, { id: "asc" }],
    ...(stranica ?? {}),
    include: {
      uredaj: {
        select: {
          id: true,
          serijski: true,
          stanje: true,
          model: { select: { id: true, naziv: true, kpdNajam: true, proizvodjac: { select: { naziv: true } } } },
        },
      },
      cijene: { orderBy: { od: "asc" } },
      mjeseci: true,
      rate: { select: { mjesec: true, iznos: true, dokumentId: true } },
    },
  });
  const uvjeti: UvjetiUgovora = { od: dan(u.od)!, do: dan(u.do), otkazan: dan(u.otkazan) };
  const fakturirano = new Map<string, number>();
  for (const p of planovi) for (const r of p.rate) fakturirano.set(kljucRate(p.id, uMjesec(r.mjesec)), centi(r.iznos));
  const plan = (p: (typeof planovi)[number]): PlanUredaja => ({
    uredajId: p.id, // ključ rate je plan (isti uređaj može biti na ugovoru u dva razdoblja)
    od: dan(p.od)!,
    do: dan(p.do),
    cijene: p.cijene.map((c) => ({ od: uMjesec(c.od), iznos: centi(c.iznos) })),
    pauze: p.mjeseci.filter((m) => m.pauza).map((m) => uMjesec(m.mjesec)),
    rucno: Object.fromEntries(p.mjeseci.filter((m) => !m.pauza && m.iznos !== null).map((m) => [uMjesec(m.mjesec), centi(m.iznos!)])),
  });
  return { uvjeti, planovi, motor: planovi.map(plan), fakturirano };
}

export type UlazUredajaNaUgovor = {
  serijski: string[];
  od: string;
  /** mjesečna cijena bez PDV-a (centi) */
  cijena: number;
  izvor: "SKLADISTE" | "KLIJENT";
};

/**
 * Uređaji na ugovor: sa skladišta (stanje → u najmu) ili već kod klijenta (iz ranijeg ugovora / otkupljen).
 * Isti uređaj ne smije biti na dva ugovora u istom razdoblju.
 */
export async function dodajUredajeNaUgovor(db: PrismaClient, akter: Akter, ugovorId: string, u: UlazUredajaNaUgovor): Promise<number> {
  if (!jeUuid(ugovorId)) throw new GreskaKorisniku("Ugovor ne postoji.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(u.od)) throw new GreskaKorisniku("Upišite datum od kojeg se uređaj naplaćuje.");
  if (!Number.isSafeInteger(u.cijena) || u.cijena < 0) throw new GreskaKorisniku("Mjesečna cijena mora biti nula ili više.");
  const serijski = [...new Set(u.serijski.map(normalizirajSerijski).filter(Boolean))];
  if (!serijski.length) throw new GreskaKorisniku("Upišite ili skenirajte barem jedan serijski broj.");
  if (serijski.length > 1000) throw new GreskaKorisniku("Najviše 1.000 uređaja odjednom.");
  const f = akter.firmaId;
  return db.$transaction(
    async (tx) => {
      const ug = await zakljucajUgovor(tx, f, ugovorId);
      const kraj = najranijiDatum(dan(ug.do), dan(ug.otkazan));
      if (kraj && u.od > kraj) throw new GreskaKorisniku("Ugovor je tada već završio.");
      const uredaji = await tx.uredaj.findMany({
        where: { firmaId: f, serijski: { in: serijski } },
        select: { id: true, serijski: true, partnerId: true },
      });
      const nema = serijski.filter((s) => !uredaji.some((x) => x.serijski === s));
      if (nema.length) throw new GreskaKorisniku(`Nisu u programu: ${nema.slice(0, 10).join(", ")}${nema.length > 10 ? " …" : ""}`);
      const ids = uredaji.map((x) => x.id);
      // zaključavanje uređaja (promijeniStanje) prije provjere preklapanja — dvije kartice ne mogu isti uređaj staviti na dva ugovora
      if (u.izvor === "KLIJENT") {
        const tudji = uredaji.filter((x) => x.partnerId !== ug.partnerId);
        if (tudji.length)
          throw new GreskaKorisniku(
            `Uređaji nisu kod ovog klijenta: ${tudji
              .map((x) => x.serijski)
              .slice(0, 10)
              .join(", ")}`,
          );
      }
      await promijeniStanje(tx, { firmaId: f, korisnikId: akter.korisnikId }, ids, u.izvor === "KLIJENT" ? "najamKodKlijenta" : "najam", {
        partnerId: ug.partnerId,
        poslovnicaId: ug.poslovnicaId,
        dokument: { vrsta: "Ugovor o najmu", id: ug.id, broj: ug.broj },
      });
      const preklapanje = await tx.uredajNaUgovoru.findMany({
        where: { firmaId: f, uredajId: { in: ids }, OR: [{ do: null }, { do: { gte: d(u.od) } }] },
        select: { uredaj: { select: { serijski: true } }, ugovor: { select: { broj: true } } },
      });
      if (preklapanje.length)
        throw new GreskaKorisniku(
          `Već na ugovoru u tom razdoblju: ${preklapanje
            .slice(0, 10)
            .map((x) => `${x.uredaj.serijski} (${x.ugovor.broj})`)
            .join(", ")}`,
        );
      const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
      const od = u.od < dan(ug.od)! ? dan(ug.od)! : u.od;
      for (const x of uredaji) {
        const p = await tx.uredajNaUgovoru.create({
          data: { firmaId: f, ugovorId, uredajId: x.id, od: d(od), izvor: u.izvor, korisnikId: akter.korisnikId, korisnik: ime },
          select: { id: true },
        });
        await tx.cijenaNajma.create({ data: { firmaId: f, planId: p.id, od: mj(mjesecOd(od)), iznos: centiUDecimal(u.cijena) } });
      }
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "najam.uredaji",
        entitet: "UgovorNajma",
        entitetId: ugovorId,
        opis: `Na ugovor ${ug.broj} dodano uređaja: ${uredaji.length} (${u.izvor === "KLIJENT" ? "već kod klijenta" : "sa skladišta"}, od ${od.split("-").reverse().join(".")}., ${(u.cijena / 100).toFixed(2)} €/mj.)`,
        novo: { serijski: uredaji.map((x) => x.serijski).join(", ") },
      });
      return uredaji.length;
    },
    { timeout: 60_000 },
  );
}

/**
 * Skupna cijena ili sezona za odabrane uređaje ugovora: nova mjesečna cijena od mjeseca (najranije od prve neizdane rate).
 * Sezona (doMjeseca): nakon nje vraća se cijena koja je prije vrijedila.
 */
export async function postaviCijenu(
  db: PrismaClient,
  akter: Akter,
  ugovorId: string,
  u: { planIds: string[]; od: Mjesec; iznos: number; doMjeseca: Mjesec | null },
): Promise<void> {
  if (!jeUuid(ugovorId) || !u.planIds.length || !u.planIds.every(jeUuid)) throw new GreskaKorisniku("Odaberite uređaje.");
  if (u.doMjeseca !== null && (!jeMjesec(u.doMjeseca) || u.doMjeseca < u.od)) throw new GreskaKorisniku("Kraj sezone mora biti nakon početka.");
  const f = akter.firmaId;
  await db.$transaction(async (tx) => {
    const ug = await zakljucajUgovor(tx, f, ugovorId);
    const n = await podaciZaNaplatu(tx, f, ugovorId);
    const odabrani = n.motor.filter((p) => u.planIds.includes(p.uredajId));
    if (odabrani.length !== new Set(u.planIds).size) throw new GreskaKorisniku("Neki uređaji nisu na ovom ugovoru.");
    for (const p of odabrani) {
      const g = provjeriPromjenuCijene(n.uvjeti, p, n.fakturirano, u.od, u.iznos);
      if (g) throw new GreskaKorisniku(`${n.planovi.find((x) => x.id === p.uredajId)!.uredaj.serijski}: ${g}`);
      const nakon = u.doMjeseca ? sljedeciMjesec(u.doMjeseca) : null;
      const vratiNa = nakon ? cijenaUMjesecu(p.cijene, nakon) : null;
      await tx.cijenaNajma.deleteMany({
        where: { firmaId: f, planId: p.uredajId, od: { gte: mj(u.od), ...(nakon ? { lte: mj(nakon) } : {}) } },
      });
      await tx.cijenaNajma.create({ data: { firmaId: f, planId: p.uredajId, od: mj(u.od), iznos: centiUDecimal(u.iznos) } });
      if (nakon && vratiNa !== null)
        await tx.cijenaNajma.create({ data: { firmaId: f, planId: p.uredajId, od: mj(nakon), iznos: centiUDecimal(vratiNa) } });
    }
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.cijena",
      entitet: "UgovorNajma",
      entitetId: ugovorId,
      opis: `Ugovor ${ug.broj}: ${(u.iznos / 100).toFixed(2)} €/mj. od ${u.od}${u.doMjeseca ? ` do ${u.doMjeseca} (sezona)` : ""} za ${odabrani.length} uređaja`,
    });
  });
}

// ——— rate za izdati (korak 3.4) ———

const MJESECI_KRATKO = (m: Mjesec) => `${m.slice(5)}/${m.slice(0, 4)}`;

/** Rate za izdati do mjeseca, grupirane za račun: isti model, mjesec, iznos i broj dana = jedna stavka. */
export function stavkeRata(n: Awaited<ReturnType<typeof podaciZaNaplatu>>, rate: Rata[]): { stavke: UlaznaStavka[]; greska: string | null } {
  const bezKpd = new Set<string>();
  const grupe = new Map<string, { s: UlaznaStavka; serijski: string[] }>();
  for (const r of rate) {
    const p = n.planovi.find((x) => x.id === r.uredajId)!;
    const m = p.uredaj.model;
    if (!m.kpdNajam) bezKpd.add(`${m.proizvodjac.naziv} ${m.naziv}`);
    const kljuc = [m.id, r.mjesec, r.iznos, r.dana, r.danaUMjesecu].join("|");
    const g = grupe.get(kljuc);
    if (g) {
      g.s.kolicina += 1000;
      g.serijski.push(p.uredaj.serijski);
      continue;
    }
    grupe.set(kljuc, {
      serijski: [p.uredaj.serijski],
      s: {
        vrsta: "MODEL",
        namjena: "NAJAM",
        modelId: m.id,
        naziv: `Najam ${m.proizvodjac.naziv} ${m.naziv} ${MJESECI_KRATKO(r.mjesec)}${r.dana < r.danaUMjesecu ? ` (${r.dana}/${r.danaUMjesecu} dana)` : ""}`,
        kpd: m.kpdNajam,
        jedinica: "mj",
        kolicina: 1000,
        cijena: r.iznos,
        popust: 0,
        stopa: 2500,
      },
    });
  }
  if (bezKpd.size) return { stavke: [], greska: `Modeli bez KPD oznake za najam (upišite je u šifrarniku): ${[...bezKpd].slice(0, 5).join(", ")}` };
  const stavke = [...grupe.values()]
    .sort((a, b) => a.s.naziv.localeCompare(b.s.naziv, "hr"))
    .map((g) => ({ ...g.s, opis: `S/N: ${g.serijski.sort().join(", ")}` }));
  return { stavke, greska: null };
}

/**
 * Izdavanje rata ugovora do mjeseca kao jedan račun s današnjim datumom — u jednoj transakciji:
 * ugovor zaključan (dvije kartice = jedan račun), rate zapisane uz račun (ista rata ne može se naplatiti dvaput).
 */
export async function izdajRate(
  db: PrismaClient,
  akter: Akter,
  ugovorId: string,
  doMjeseca: Mjesec,
  sada = new Date(),
  /** automatsko izdavanje: samo rate od mjeseca uključivanja (starije zaostale izdaje korisnik) */
  odMjeseca: Mjesec | null = null,
): Promise<{ id: string; broj: string; fiskal: string | null }> {
  if (!jeUuid(ugovorId)) throw new GreskaKorisniku("Ugovor ne postoji.");
  if (!jeMjesec(doMjeseca)) throw new GreskaKorisniku("Mjesec nije ispravan.");
  const f = akter.firmaId;
  const r = await db.$transaction(
    async (tx) => {
      const ug = await zakljucajUgovor(tx, f, ugovorId);
      const n = await podaciZaNaplatu(tx, f, ugovorId);
      const rate = zaIzdati(n.uvjeti, n.motor, n.fakturirano, doMjeseca).filter((r) => !odMjeseca || r.mjesec >= odMjeseca);
      if (!rate.length) throw new GreskaKorisniku("Nema rata za izdati.");
      const { stavke, greska } = stavkeRata(n, rate);
      if (greska) throw new GreskaKorisniku(greska);
      const dat = danas(sada);
      const nacrt = await spremiNacrt(tx, akter, null, {
        vrsta: "RACUN",
        verzija: 0,
        partnerId: ug.partnerId,
        poslovnicaId: ug.poslovnicaId,
        datum: dat,
        vrijediDo: null,
        dospijece: dodajDane(dat, ug.rokPlacanjaDana),
        popust: 0,
        napomena: [`Ugovor o najmu ${ug.broj}`, ug.napomenaRacuna].filter(Boolean).join("\n"),
        nacinPlacanja: ug.nacinPlacanja as "T",
        stavke,
      });
      await tx.prodajniDokument.update({ where: { id: nacrt.id }, data: { ugovorNajmaId: ugovorId } });
      const izdan = await izdajRacunUBazi(tx, akter, nacrt.id, sada);
      const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
      await tx.rataNajma.createMany({
        data: rate.map((x) => ({
          firmaId: f,
          planId: x.uredajId,
          mjesec: mj(x.mjesec),
          iznos: centiUDecimal(x.iznos),
          dokumentId: nacrt.id,
          korisnikId: akter.korisnikId,
          korisnik: ime,
        })),
      });
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "najam.izdaj",
        entitet: "UgovorNajma",
        entitetId: ugovorId,
        opis: `Ugovor ${ug.broj}: izdan račun ${izdan.broj} za ${rate.length} rata (do ${MJESECI_KRATKO(doMjeseca)})`,
      });
      return { id: nacrt.id, ...izdan };
    },
    { timeout: 120_000 },
  );
  return { id: r.id, broj: r.broj, fiskal: r.fiskalizirati ? await porukaFiskalizacije(db, f, r.id, sada) : null };
}

/** „Izdano izvan programa“: rata se označava naplaćenom bez računa u programu (npr. stari program). */
export async function oznaciIzvanPrograma(db: PrismaClient, akter: Akter, ugovorId: string, planId: string, mjesec: Mjesec, izvan: boolean) {
  if (!jeUuid(ugovorId) || !jeUuid(planId) || !jeMjesec(mjesec)) throw new GreskaKorisniku("Rata ne postoji.");
  const f = akter.firmaId;
  await db.$transaction(async (tx) => {
    const ug = await zakljucajUgovor(tx, f, ugovorId);
    const n = await podaciZaNaplatu(tx, f, ugovorId);
    const plan = n.motor.find((p) => p.uredajId === planId);
    if (!plan) throw new GreskaKorisniku("Uređaj nije na ovom ugovoru.");
    const serijski = n.planovi.find((p) => p.id === planId)!.uredaj.serijski;
    if (izvan) {
      const rata = rateUredaja(n.uvjeti, plan, n.fakturirano, mjesec).find((x) => x.mjesec === mjesec);
      if (!rata || rata.izvor === "FAKTURIRANO") throw new GreskaKorisniku("Ta rata je već izdana ili ne postoji.");
      await tx.rataNajma.create({ data: { firmaId: f, planId, mjesec: mj(mjesec), iznos: centiUDecimal(rata.iznos), korisnikId: akter.korisnikId } });
    } else {
      const obrisano = await tx.rataNajma.deleteMany({ where: { firmaId: f, planId, mjesec: mj(mjesec), dokumentId: null } });
      if (!obrisano.count) throw new GreskaKorisniku("Rata nije označena kao izdana izvan programa (rata s računa se ispravlja odobrenjem).");
    }
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.izvan",
      entitet: "UgovorNajma",
      entitetId: ugovorId,
      opis: `Ugovor ${ug.broj}, ${serijski}, ${MJESECI_KRATKO(mjesec)}: ${izvan ? "izdano izvan programa" : "vraćeno za izdavanje"}`,
    });
  });
}

// ——— raspored (korak 3.5) ———

export type IzmjenaMjeseca = { vrsta: "PAUZA" } | { vrsta: "RUCNO"; iznos: number } | { vrsta: "PLAN" };

/** Pauza, ručni iznos ili povratak na plan za mjesec neizdane rate. */
export async function postaviMjesec(db: PrismaClient, akter: Akter, ugovorId: string, planId: string, mjesec: Mjesec, izmjena: IzmjenaMjeseca) {
  if (!jeUuid(ugovorId) || !jeUuid(planId)) throw new GreskaKorisniku("Uređaj nije na ovom ugovoru.");
  if (izmjena.vrsta === "RUCNO" && (!Number.isSafeInteger(izmjena.iznos) || izmjena.iznos < 0))
    throw new GreskaKorisniku("Iznos mora biti nula ili više.");
  const f = akter.firmaId;
  await db.$transaction(async (tx) => {
    const ug = await zakljucajUgovor(tx, f, ugovorId);
    const plan = await tx.uredajNaUgovoru.findFirst({
      where: { id: planId, firmaId: f, ugovorId },
      include: { uredaj: { select: { serijski: true } } },
    });
    if (!plan) throw new GreskaKorisniku("Uređaj nije na ovom ugovoru.");
    const fakturirano = new Map(
      (await tx.rataNajma.findMany({ where: { firmaId: f, planId }, select: { mjesec: true, iznos: true } })).map((r) => [
        kljucRate(planId, uMjesec(r.mjesec)),
        centi(r.iznos),
      ]),
    );
    const g = provjeriIzmjenuMjeseca({ uredajId: planId } as PlanUredaja, fakturirano, mjesec);
    if (g) throw new GreskaKorisniku(g);
    const kljuc = { firmaId_planId_mjesec: { firmaId: f, planId, mjesec: mj(mjesec) } };
    if (izmjena.vrsta === "PLAN") await tx.mjesecNajma.deleteMany({ where: { firmaId: f, planId, mjesec: mj(mjesec) } });
    else {
      const data = izmjena.vrsta === "PAUZA" ? { pauza: true, iznos: null } : { pauza: false, iznos: centiUDecimal(izmjena.iznos) };
      await tx.mjesecNajma.upsert({ where: kljuc, create: { firmaId: f, planId, mjesec: mj(mjesec), ...data }, update: data });
    }
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.mjesec",
      entitet: "UgovorNajma",
      entitetId: ugovorId,
      opis: `Ugovor ${ug.broj}, ${plan.uredaj.serijski}, ${MJESECI_KRATKO(mjesec)}: ${
        izmjena.vrsta === "PAUZA" ? "pauza" : izmjena.vrsta === "RUCNO" ? `ručni iznos ${(izmjena.iznos / 100).toFixed(2)} €` : "prema planu"
      }`,
    });
  });
}

// ——— pauza, povrat, višak (korak 3.6) ———

/**
 * Povrat uređaja s ugovora do datuma (zadnji dan naplate): plan dobiva kraj, uređaj se vraća na skladište.
 * Već izdane rate se ne mijenjaju — višak (npr. naplaćen cijeli mjesec) vraća se kao prijedlog za odobrenje.
 */
export async function vratiUredaj(
  db: PrismaClient,
  akter: Akter,
  ugovorId: string,
  planId: string,
  datum: string,
  skladisteId: string,
): Promise<{ visak: number; mjeseci: { mjesec: Mjesec; razlika: number }[] }> {
  if (!jeUuid(ugovorId) || !jeUuid(planId)) throw new GreskaKorisniku("Uređaj nije na ovom ugovoru.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new GreskaKorisniku("Upišite datum povrata.");
  if (!jeUuid(skladisteId)) throw new GreskaKorisniku("Odaberite skladište.");
  const f = akter.firmaId;
  return db.$transaction(async (tx) => {
    const ug = await zakljucajUgovor(tx, f, ugovorId);
    const plan = await tx.uredajNaUgovoru.findFirst({
      where: { id: planId, firmaId: f, ugovorId },
      include: { uredaj: { select: { id: true, serijski: true } } },
    });
    if (!plan) throw new GreskaKorisniku("Uređaj nije na ovom ugovoru.");
    if (plan.do) throw new GreskaKorisniku(`Uređaj ${plan.uredaj.serijski} je već vraćen.`);
    if (datum < dan(plan.od)!) throw new GreskaKorisniku("Povrat ne može biti prije početka naplate uređaja.");
    if (!(await tx.skladiste.count({ where: { id: skladisteId, firmaId: f, aktivan: true } })))
      throw new GreskaKorisniku("Odaberite aktivno skladište.");
    await tx.uredajNaUgovoru.update({ where: { id: planId }, data: { do: d(datum) } });
    await promijeniStanje(tx, { firmaId: f, korisnikId: akter.korisnikId }, [plan.uredaj.id], "povratIzNajma", {
      skladisteId,
      dokument: { vrsta: "Ugovor o najmu", id: ug.id, broj: ug.broj },
      opis: `Povrat s ugovora ${ug.broj} (naplata do ${datum.split("-").reverse().join(".")}.)`,
    });
    const n = await podaciZaNaplatu(tx, f, ugovorId);
    const v = visak(
      n.uvjeti,
      n.motor.find((p) => p.uredajId === planId)!,
      n.fakturirano,
    );
    const ukupno = v.reduce((a, x) => a + x.razlika, 0);
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.povrat",
      entitet: "UgovorNajma",
      entitetId: ugovorId,
      opis: `Ugovor ${ug.broj}: povrat ${plan.uredaj.serijski} do ${datum.split("-").reverse().join(".")}.${ukupno ? ` Višak za odobrenje: ${(ukupno / 100).toFixed(2)} €` : ""}`,
    });
    return { visak: ukupno, mjeseci: v.map((x) => ({ mjesec: x.mjesec, razlika: x.razlika })) };
  });
}

/** Pauza cijelog ugovora za mjesece od–do (svi uređaji); izdani mjeseci se ne diraju (greška s popisom). */
export async function pauzirajUgovor(db: PrismaClient, akter: Akter, ugovorId: string, od: Mjesec, doM: Mjesec, pauza: boolean): Promise<number> {
  if (!jeUuid(ugovorId)) throw new GreskaKorisniku("Ugovor ne postoji.");
  if (!jeMjesec(od) || !jeMjesec(doM) || doM < od) throw new GreskaKorisniku("Odaberite mjesece pauze (od – do).");
  const lista = mjeseci(od, doM);
  if (lista.length > 36) throw new GreskaKorisniku("Pauza može trajati najviše 36 mjeseci.");
  const f = akter.firmaId;
  return db.$transaction(async (tx) => {
    const ug = await zakljucajUgovor(tx, f, ugovorId);
    const n = await podaciZaNaplatu(tx, f, ugovorId);
    const izdano = n.planovi.flatMap((p) =>
      lista.filter((m) => n.fakturirano.has(kljucRate(p.id, m))).map((m) => `${p.uredaj.serijski} ${MJESECI_KRATKO(m)}`),
    );
    if (izdano.length) throw new GreskaKorisniku(`Neke rate su već izdane: ${izdano.slice(0, 5).join(", ")}${izdano.length > 5 ? " …" : ""}`);
    const planIds = n.planovi.map((p) => p.id);
    if (pauza) {
      await tx.mjesecNajma.deleteMany({ where: { firmaId: f, planId: { in: planIds }, mjesec: { gte: mj(od), lte: mj(doM) } } });
      await tx.mjesecNajma.createMany({ data: planIds.flatMap((planId) => lista.map((m) => ({ firmaId: f, planId, mjesec: mj(m), pauza: true }))) });
    } else await tx.mjesecNajma.deleteMany({ where: { firmaId: f, planId: { in: planIds }, mjesec: { gte: mj(od), lte: mj(doM) }, pauza: true } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.pauza",
      entitet: "UgovorNajma",
      entitetId: ugovorId,
      opis: `Ugovor ${ug.broj}: ${pauza ? "pauza" : "ukinuta pauza"} ${MJESECI_KRATKO(od)} – ${MJESECI_KRATKO(doM)} (${planIds.length} uređaja)`,
    });
    return planIds.length;
  });
}

/** Višak za odobrenje po ugovoru: izdane rate veće od onoga što bi sada trebalo (povrat, otkaz, pauza). */
export function visakUgovora(n: Awaited<ReturnType<typeof podaciZaNaplatu>>) {
  return n.planovi.flatMap((p, i) =>
    visak(n.uvjeti, n.motor[i]!, n.fakturirano).map((x) => ({
      ...x,
      serijski: p.uredaj.serijski,
      dokumentId: p.rate.find((r) => uMjesec(r.mjesec) === x.mjesec)?.dokumentId ?? null,
    })),
  );
}

// ——— automatsko izdavanje (korak 3.7) ———

/** Uključivanje/isključivanje automatskog izdavanja: vrijedi od danas (ranije rate izdaje korisnik). */
export async function postaviAutomatsko(db: PrismaClient, akter: Akter, ugovorId: string, ukljuci: boolean, sada = new Date()) {
  if (!jeUuid(ugovorId)) throw new GreskaKorisniku("Ugovor ne postoji.");
  await db.$transaction(async (tx) => {
    const ug = await zakljucajUgovor(tx, akter.firmaId, ugovorId);
    if (ug.automatski === ukljuci) return;
    await tx.ugovorNajma.update({
      where: { id: ugovorId },
      data: {
        automatski: ukljuci,
        automatskiOd: ukljuci ? d(danas(sada)) : null,
        automatskiKorisnikId: ukljuci ? akter.korisnikId : null,
        verzija: { increment: 1 },
      },
    });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.automatski",
      entitet: "UgovorNajma",
      entitetId: ugovorId,
      opis: `Ugovor ${ug.broj}: automatsko izdavanje ${ukljuci ? `uključeno od ${danas(sada).split("-").reverse().join(".")}.` : "isključeno"}`,
    });
  });
}

/**
 * Pozadinski posao (jednom na sat; ponovno pokretanje ne izdaje ništa): za ugovore s automatskim izdavanjem
 * izdaje rate tekućeg mjeseca (i propuštene od dana uključivanja) u ime korisnika koji ga je uključio.
 */
export async function automatskoIzdavanje(db: PrismaClient, sada = new Date()): Promise<{ izdano: number; greske: string[] }> {
  const ugovori = await db.ugovorNajma.findMany({
    where: { automatski: true, automatskiOd: { lte: d(danas(sada)) }, uredaji: { some: {} } },
    select: { id: true, firmaId: true, broj: true, automatskiOd: true, automatskiKorisnikId: true },
  });
  let izdano = 0;
  const greske: string[] = [];
  const tekuci = mjesecOd(danas(sada));
  for (const u of ugovori) {
    try {
      if (!u.automatskiKorisnikId) throw new GreskaKorisniku("nije poznato tko je uključio izdavanje");
      const prava = await pravaClana(db, u.firmaId, u.automatskiKorisnikId);
      if (!prava || !imaPravo(prava, "najam", "operativno")) throw new GreskaKorisniku("korisnik koji je uključio izdavanje više nema pravo");
      await izdajRate(
        db,
        { firmaId: u.firmaId, korisnikId: u.automatskiKorisnikId, prava, ip: null },
        u.id,
        tekuci,
        sada,
        mjesecOd(dan(u.automatskiOd)!),
      );
      izdano++;
      await db.ugovorNajma.updateMany({ where: { id: u.id, firmaId: u.firmaId, automatskiGreska: { not: null } }, data: { automatskiGreska: null } });
    } catch (e) {
      if (e instanceof GreskaKorisniku && e.message === "Nema rata za izdati.") continue;
      const poruka = e instanceof Error ? e.message : "greška";
      greske.push(`${u.broj}: ${poruka}`);
      await db.ugovorNajma.updateMany({ where: { id: u.id, firmaId: u.firmaId }, data: { automatskiGreska: poruka.slice(0, 500) } });
    }
  }
  return { izdano, greske };
}
