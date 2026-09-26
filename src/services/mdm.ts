import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import { kodUpisa, provjeriNadredenu, vidljiveOrganizacije, type PodaciUpisa, type VrstaOrganizacije } from "@/domain/mdm";
import { GreskaKorisniku } from "@/lib/greske";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { hashTokena } from "./prijava";

/**
 * MDM (korak 5.5): organizacije (distributer → klijent), upis uređaja kodom ili QR-om, javljanje agenta.
 * Agent se autentificira tokenom dobivenim pri upisu (u bazi samo hash); blokiran uređaj ne prolazi.
 */
type Tx = Prisma.TransactionClient;
const noviKod = () => kodUpisa(randomBytes(12));

export type UlazOrganizacije = { naziv: string; vrsta: VrstaOrganizacije; nadredenaId: string | null; partnerId: string | null; aktivna: boolean };

export async function spremiOrganizaciju(db: PrismaClient, a: Akter, id: string | null, u: UlazOrganizacije): Promise<string> {
  const naziv = u.naziv.trim();
  if (!naziv || naziv.length > 120) throw new GreskaKorisniku("Upišite naziv (do 120 znakova).");
  if (u.vrsta !== "DISTRIBUTER" && u.vrsta !== "KLIJENT") throw new GreskaKorisniku("Odaberite vrstu.");
  for (const x of [id, u.nadredenaId, u.partnerId]) if (x !== null && !jeUuid(x)) throw new GreskaKorisniku("Neispravan odabir.");
  const f = a.firmaId;
  return db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `mdm-organizacije:${f}`);
    const sve = await tx.mdmOrganizacija.findMany({ where: { firmaId: f }, select: { id: true, nadredenaId: true, partnerId: true, vrsta: true } });
    const stara = id ? await tx.mdmOrganizacija.findFirst({ where: { id, firmaId: f } }) : null;
    if (id && !stara) throw new GreskaKorisniku("Organizacija ne postoji.");
    const g = provjeriNadredenu(sve, id, u.vrsta, u.nadredenaId);
    if (g) throw new GreskaKorisniku(g);
    if (id && u.vrsta === "KLIJENT" && sve.some((o) => o.nadredenaId === id))
      throw new GreskaKorisniku("Organizacija ima podređene — ne može postati klijent.");
    if (u.partnerId && !(await tx.partner.count({ where: { id: u.partnerId, firmaId: f } }))) throw new GreskaKorisniku("Partner ne postoji.");
    const podaci = { naziv, vrsta: u.vrsta, nadredenaId: u.nadredenaId, partnerId: u.partnerId, aktivna: u.aktivna };
    let oid: string;
    if (stara) {
      await tx.mdmOrganizacija.update({ where: { id: stara.id }, data: podaci });
      oid = stara.id;
    } else {
      const ime = (await tx.korisnik.findUnique({ where: { id: a.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
      oid = (
        await tx.mdmOrganizacija.create({
          data: { firmaId: f, ...podaci, kodUpisa: noviKod(), korisnikId: a.korisnikId, korisnik: ime },
          select: { id: true },
        })
      ).id;
    }
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.organizacije",
      entitet: "MdmOrganizacija",
      entitetId: oid,
      opis: `${stara ? "Izmijenjena" : "Nova"} MDM organizacija ${naziv}`,
      staro: stara
        ? { naziv: stara.naziv, vrsta: stara.vrsta, nadredenaId: stara.nadredenaId, partnerId: stara.partnerId, aktivna: stara.aktivna }
        : undefined,
      novo: podaci,
    });
    return oid;
  });
}

/** Novi kod upisa (stari prestaje vrijediti; već upisani uređaji ostaju). */
export async function noviKodUpisa(db: PrismaClient, a: Akter, id: string): Promise<string> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Organizacija ne postoji.");
  return db.$transaction(async (tx) => {
    const o = await tx.mdmOrganizacija.findFirst({ where: { id, firmaId: a.firmaId }, select: { naziv: true } });
    if (!o) throw new GreskaKorisniku("Organizacija ne postoji.");
    const kod = noviKod();
    await tx.mdmOrganizacija.update({ where: { id }, data: { kodUpisa: kod } });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.organizacije",
      entitet: "MdmOrganizacija",
      entitetId: id,
      opis: `MDM ${o.naziv}: novi kod upisa (stari više ne vrijedi)`,
    });
    return kod;
  });
}

/**
 * Upis uređaja (agent): kod određuje firmu i organizaciju. Isti serijski u firmi se ponovno upisuje
 * (novi token, stari prestaje vrijediti) — osim ako je uređaj blokiran.
 */
export async function upisiUredaj(db: PrismaClient, u: PodaciUpisa, ip: string | null): Promise<{ id: string; token: string }> {
  return db.$transaction(async (tx) => {
    const o = await tx.mdmOrganizacija.findUnique({
      where: { kodUpisa: u.kod },
      select: { id: true, firmaId: true, naziv: true, aktivna: true, firma: { select: { aktivna: true } } },
    });
    if (!o || !o.aktivna || !o.firma.aktivna) throw new GreskaKorisniku("Kod upisa nije ispravan.");
    const f = o.firmaId;
    await zakljucajKljuc(tx, `mdm-upis:${f}:${u.serijski}`);
    const token = randomBytes(32).toString("base64url");
    const postoji = await tx.mdmUredaj.findFirst({
      where: { firmaId: f, serijski: u.serijski },
      select: { id: true, stanje: true, ponovniUpis: true, organizacija: { select: { naziv: true } } },
    });
    if (postoji?.stanje === "BLOKIRAN") throw new GreskaKorisniku("Uređaj je blokiran — javite se administratoru.");
    // serijski nije tajna: već upisan uređaj ne može se preoteti tuđim kodom — ponovni upis dopušta zaposlenik (jednokratno)
    if (postoji && !postoji.ponovniUpis) throw new GreskaKorisniku("Uređaj je već upisan — za ponovni upis javite se administratoru.");
    const skladisni = await tx.uredaj.findFirst({ where: { firmaId: f, serijski: u.serijski }, select: { id: true } });
    const podaci = {
      organizacijaId: o.id,
      uredajId: skladisni?.id ?? null,
      platforma: u.platforma,
      naziv: u.naziv,
      model: u.model,
      osVerzija: u.osVerzija,
      verzijaAgenta: u.verzijaAgenta,
      tokenHash: hashTokena(token),
      zadnjiKontakt: new Date(),
    };
    const m = postoji
      ? await tx.mdmUredaj.update({ where: { id: postoji.id }, data: { ...podaci, ponovniUpis: false, upisan: new Date() }, select: { id: true } })
      : await tx.mdmUredaj.create({ data: { firmaId: f, serijski: u.serijski, ...podaci }, select: { id: true } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: null,
      ip,
      radnja: "mdm.upis",
      entitet: "MdmUredaj",
      entitetId: m.id,
      opis: `MDM: ${postoji ? `ponovno upisan (prije: ${postoji.organizacija.naziv})` : "upisan"} ${u.serijski} (${u.platforma}) u ${o.naziv}`,
    });
    return { id: m.id, token };
  });
}

/** Uređaj agenta po tokenu (samo aktivan u aktivnoj organizaciji i firmi) ili null. */
export async function agentPoTokenu(db: PrismaClient | Tx, token: string | null) {
  if (!token || token.length > 200) return null;
  const m = await db.mdmUredaj.findUnique({
    where: { tokenHash: hashTokena(token) },
    include: { organizacija: { select: { aktivna: true } }, firma: { select: { aktivna: true } } },
  });
  if (!m || m.stanje !== "AKTIVAN" || !m.organizacija.aktivna || !m.firma.aktivna) return null;
  return m;
}

/** Javljanje agenta: zadnji kontakt i izvještaj (do 32 KB JSON-a). */
export async function javiSe(db: PrismaClient, token: string | null, izvjestaj: unknown, sada = new Date()): Promise<{ id: string } | null> {
  const m = await agentPoTokenu(db, token);
  if (!m) return null;
  const json = izvjestaj && typeof izvjestaj === "object" && !Array.isArray(izvjestaj) ? JSON.stringify(izvjestaj) : "{}";
  await db.mdmUredaj.update({
    where: { id: m.id },
    data: {
      zadnjiKontakt: sada,
      izvjestaj: json.length <= 32_768 ? (JSON.parse(json) as Prisma.InputJsonObject) : { greska: "Izvještaj je prevelik." },
    },
  });
  return { id: m.id };
}

/** Blokiranje (agent odmah gubi pristup) ili ponovno uključivanje. */
export async function postaviStanjeMdmUredaja(db: PrismaClient, a: Akter, id: string, stanje: "AKTIVAN" | "BLOKIRAN"): Promise<void> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Uređaj ne postoji.");
  await db.$transaction(async (tx) => {
    const m = await tx.mdmUredaj.findFirst({ where: { id, firmaId: a.firmaId }, select: { serijski: true, stanje: true } });
    if (!m) throw new GreskaKorisniku("Uređaj ne postoji.");
    await tx.mdmUredaj.update({ where: { id }, data: { stanje } });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.uredaji",
      entitet: "MdmUredaj",
      entitetId: id,
      opis: `MDM ${m.serijski}: ${stanje === "BLOKIRAN" ? "blokiran" : "ponovno aktivan"}`,
      staro: { stanje: m.stanje },
      novo: { stanje },
    });
  });
}

// ——— portal: distributer i klijent vide samo svoje ———

export async function vidljiveOrganizacijePartnera(db: PrismaClient, firmaId: string, partnerId: string) {
  const sve = await db.mdmOrganizacija.findMany({
    where: { firmaId, aktivna: true },
    orderBy: { naziv: "asc" },
    select: { id: true, naziv: true, vrsta: true, nadredenaId: true, partnerId: true, kodUpisa: true, _count: { select: { uredaji: true } } },
  });
  const vidi = vidljiveOrganizacije(sve, partnerId);
  return sve.filter((o) => vidi.has(o.id));
}

/** Broj uređaja „na vezi“ (javili se u zadnjih 15 min) po organizaciji. */
export async function naVeziPoOrganizaciji(db: PrismaClient, firmaId: string, sada = new Date()): Promise<Map<string, number>> {
  const r = await db.mdmUredaj.groupBy({
    by: ["organizacijaId"],
    where: { firmaId, zadnjiKontakt: { gte: new Date(sada.getTime() - 15 * 60_000) } },
    _count: true,
  });
  return new Map(r.map((x) => [x.organizacijaId, x._count]));
}

/** Organizacija i njeni uređaji za partnera na portalu — samo ako je vidljiva tom partneru. */
export async function organizacijaPartnera(db: PrismaClient, firmaId: string, partnerId: string, id: string) {
  if (!jeUuid(id)) return null;
  const vidljive = await vidljiveOrganizacijePartnera(db, firmaId, partnerId);
  const o = vidljive.find((x) => x.id === id);
  if (!o) return null;
  const uredaji = await db.mdmUredaj.findMany({
    where: { firmaId, organizacijaId: id },
    orderBy: { serijski: "asc" },
    take: 500,
    select: { id: true, serijski: true, naziv: true, platforma: true, zadnjiKontakt: true, stanje: true, osVerzija: true },
  });
  return { ...o, podredene: vidljive.filter((x) => x.nadredenaId === id), uredaji };
}

/** Zaposlenik dopušta jednokratni ponovni upis uređaja (npr. nova instalacija agenta ili premještaj u drugu organizaciju). */
export async function dopustiPonovniUpis(db: PrismaClient, a: Akter, id: string): Promise<void> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Uređaj ne postoji.");
  await db.$transaction(async (tx) => {
    const m = await tx.mdmUredaj.findFirst({ where: { id, firmaId: a.firmaId }, select: { serijski: true } });
    if (!m) throw new GreskaKorisniku("Uređaj ne postoji.");
    await tx.mdmUredaj.update({ where: { id }, data: { ponovniUpis: true } });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.uredaji",
      entitet: "MdmUredaj",
      entitetId: id,
      opis: `MDM ${m.serijski}: dopušten ponovni upis`,
    });
  });
}
