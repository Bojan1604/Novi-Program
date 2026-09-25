import type { Prisma } from "@/generated/prisma/client";
import { centiIzDecimala } from "@/domain/novac";
import { pdvStatus } from "@/domain/partner";
import type { Sortiranje } from "@/domain/popis";
import type { DbFirme } from "@/lib/firma-db";

export type FilterPartnera = {
  trazi?: string;
  vrsta: string[];
  aktivnost: string[];
  sort: Sortiranje<"naziv" | "mjesto" | "stvoreno">;
  stranica: number;
  velicina: number;
};

export function uvjetPartnera(firmaId: string, f: Pick<FilterPartnera, "trazi" | "vrsta" | "aktivnost">): Prisma.PartnerWhereInput {
  const w: Prisma.PartnerWhereInput = { firmaId };
  const i: Prisma.PartnerWhereInput[] = [];
  if (f.trazi) {
    const t = f.trazi.trim();
    i.push({
      OR: [
        { naziv: { contains: t, mode: "insensitive" } },
        { oib: { startsWith: t } },
        { pdvBroj: { contains: t.toUpperCase() } },
        { mjesto: { contains: t, mode: "insensitive" } },
      ],
    });
  }
  if (f.vrsta.length === 1) i.push(f.vrsta[0] === "dobavljaci" ? { dobavljac: true } : { kupac: true });
  if (f.aktivnost.length === 1) i.push({ aktivan: f.aktivnost[0] === "aktivni" });
  if (i.length) w.AND = i;
  return w;
}

export async function popisPartnera(db: DbFirme, firmaId: string, f: FilterPartnera) {
  const where = uvjetPartnera(firmaId, f);
  const [ukupno, redovi] = await Promise.all([
    db.partner.count({ where }),
    db.partner.findMany({
      where,
      // prazno mjesto uvijek na kraju; naziv i datum nikad nisu prazni
      orderBy: [f.sort.kljuc === "mjesto" ? { mjesto: { sort: f.sort.smjer, nulls: "last" } } : { [f.sort.kljuc]: f.sort.smjer }, { id: "asc" }],
      skip: (f.stranica - 1) * f.velicina,
      take: f.velicina,
      select: {
        id: true,
        naziv: true,
        oib: true,
        pdvBroj: true,
        drzava: true,
        mjesto: true,
        kupac: true,
        dobavljac: true,
        aktivan: true,
        eRacunAdresa: true,
        eRacunAktivan: true,
      },
    }),
  ]);
  return { ukupno, redovi };
}

export async function partner(db: DbFirme, firmaId: string, id: string) {
  const p = await db.partner.findFirst({
    where: { id, firmaId },
    include: { cjenik: { select: { id: true, naziv: true } }, poslovnice: { orderBy: [{ aktivan: "desc" }, { naziv: "asc" }] } },
  });
  if (!p) return null;
  return { ...p, efektivniPdvStatus: pdvStatus(p.drzava, p.pdvBroj, p.pdvStatus) };
}

export async function opcijeCjenika(db: DbFirme, firmaId: string, trenutni?: string | null) {
  const c = await db.cjenik.findMany({
    where: { firmaId, OR: [{ aktivan: true }, ...(trenutni ? [{ id: trenutni }] : [])] },
    orderBy: { naziv: "asc" },
    select: { id: true, naziv: true },
  });
  return c.map((x) => ({ vrijednost: x.id, naziv: x.naziv }));
}

export async function popisCjenika(db: DbFirme, firmaId: string) {
  const c = await db.cjenik.findMany({
    where: { firmaId },
    orderBy: [{ aktivan: "desc" }, { naziv: "asc" }],
    include: { _count: { select: { stavke: true, partneri: true } } },
  });
  return c.map((x) => ({
    id: x.id,
    naziv: x.naziv,
    opis: x.opis,
    aktivan: x.aktivan,
    popust: x.popust ? centiIzDecimala(x.popust.toString()) : null,
    stavki: x._count.stavke,
    partnera: x._count.partneri,
  }));
}

export async function cjenik(db: DbFirme, firmaId: string, id: string) {
  const c = await db.cjenik.findFirst({
    where: { id, firmaId },
    include: {
      stavke: {
        include: {
          model: { select: { id: true, naziv: true, preporucenaCijena: true, proizvodjac: { select: { naziv: true } } } },
          usluga: { select: { id: true, naziv: true, cijena: true, jedinica: true } },
        },
      },
      partneri: { select: { id: true, naziv: true }, orderBy: { naziv: "asc" }, take: 50 },
    },
  });
  if (!c) return null;
  const stavke = c.stavke
    .map((s) => ({
      id: s.id,
      modelId: s.modelId,
      uslugaId: s.uslugaId,
      naziv: s.model ? `${s.model.proizvodjac.naziv} ${s.model.naziv}` : `${s.usluga?.naziv} (${s.usluga?.jedinica})`,
      vrsta: s.model ? "Model" : "Usluga",
      cijena: centiIzDecimala(s.cijena.toString()),
      osnovna: s.model?.preporucenaCijena
        ? centiIzDecimala(s.model.preporucenaCijena.toString())
        : s.usluga?.cijena
          ? centiIzDecimala(s.usluga.cijena.toString())
          : null,
    }))
    .sort((a, b) => a.naziv.localeCompare(b.naziv, "hr"));
  return {
    id: c.id,
    naziv: c.naziv,
    opis: c.opis,
    aktivan: c.aktivan,
    popust: c.popust ? centiIzDecimala(c.popust.toString()) : null,
    stavke,
    partneri: c.partneri,
  };
}

/** Pretraga za odabir (pretraživač): najviše 20 rezultata. */
export async function odabirPartnera(db: DbFirme, firmaId: string, upit: string, vrsta?: "kupac" | "dobavljac") {
  const r = await db.partner.findMany({
    where: { ...uvjetPartnera(firmaId, { trazi: upit, vrsta: [], aktivnost: ["aktivni"] }), ...(vrsta ? { [vrsta]: true } : {}) },
    orderBy: { naziv: "asc" },
    take: 20,
    select: { id: true, naziv: true, oib: true, pdvBroj: true, mjesto: true },
  });
  return r.map((p) => ({ id: p.id, naziv: p.naziv, opis: [p.oib ? `OIB ${p.oib}` : p.pdvBroj, p.mjesto].filter(Boolean).join(" · ") }));
}

export async function odabirModela(db: DbFirme, firmaId: string, upit: string) {
  const t = upit.trim();
  const r = await db.modelUredaja.findMany({
    where: {
      firmaId,
      aktivan: true,
      OR: [
        { naziv: { contains: t, mode: "insensitive" } },
        { sifra: { startsWith: t, mode: "insensitive" } },
        { proizvodjac: { naziv: { contains: t, mode: "insensitive" } } },
      ],
    },
    orderBy: { naziv: "asc" },
    take: 20,
    select: { id: true, naziv: true, sifra: true, proizvodjac: { select: { naziv: true } }, kategorija: { select: { naziv: true } } },
  });
  return r.map((m) => ({ id: m.id, naziv: `${m.proizvodjac.naziv} ${m.naziv}`, opis: [m.kategorija.naziv, m.sifra].filter(Boolean).join(" · ") }));
}

export async function odabirUsluga(db: DbFirme, firmaId: string, upit: string) {
  const r = await db.usluga.findMany({
    where: { firmaId, aktivan: true, naziv: { contains: upit.trim(), mode: "insensitive" } },
    orderBy: { naziv: "asc" },
    take: 20,
    select: { id: true, naziv: true, jedinica: true },
  });
  return r.map((u) => ({ id: u.id, naziv: u.naziv, opis: u.jedinica }));
}
