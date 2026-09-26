import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import type { Platforma } from "@/domain/mdm";
import {
  instaliraneIzIzvjestaja,
  lanacOrganizacija,
  potrebneInstalacije,
  procitajPostavke,
  provjeriNaredbu,
  VRSTE_NAREDBI,
  vazeciProfil,
  zeljeneAplikacije,
  type PostavkeProfila,
} from "@/domain/mdm-upravljanje";
import { imaPravo } from "@/domain/prava";
import { GreskaKorisniku } from "@/lib/greske";
import { desifriraj, sifriraj } from "@/lib/tajne";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { agentPoTokenu } from "./mdm";

/**
 * MDM upravljanje (korak 5.6): profili, aplikacije (APK/MSI) s verzijama, datoteke, naredbe, snimke zaslona, zapisnici.
 * Agent pri svakom javljanju dobiva naredbe, važeći profil, željene aplikacije i datoteke; ako javi stariju verziju
 * dodijeljene aplikacije, sam dobiva naredbu za instalaciju nove.
 */
type Tx = Prisma.TransactionClient;
export const NAJVECA_APLIKACIJA = 150 * 1024 * 1024;
export const NAJVECA_DATOTEKA = 20 * 1024 * 1024;
export const NAJVECA_SNIMKA = 8 * 1024 * 1024;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const ime = async (tx: Tx, a: Akter) => (await tx.korisnik.findUnique({ where: { id: a.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";

async function organizacijaFirme(tx: Tx, firmaId: string, id: string | null) {
  if (id === null) return null;
  if (!jeUuid(id)) throw new GreskaKorisniku("Organizacija ne postoji.");
  const o = await tx.mdmOrganizacija.findFirst({ where: { id, firmaId }, select: { id: true, naziv: true } });
  if (!o) throw new GreskaKorisniku("Organizacija ne postoji.");
  return o;
}

// ——— profili ———

export type UlazProfila = {
  naziv: string;
  organizacijaId: string | null;
  platforma: Platforma;
  postavke: Record<string, unknown>;
  /** null = ne mijenja; "" = briše */
  wifiLozinka: string | null;
  aktivan: boolean;
};

export async function spremiProfil(db: PrismaClient, a: Akter, id: string | null, u: UlazProfila): Promise<string> {
  const naziv = u.naziv.trim();
  if (!naziv || naziv.length > 120) throw new GreskaKorisniku("Upišite naziv profila.");
  if (u.platforma !== "ANDROID" && u.platforma !== "WINDOWS") throw new GreskaKorisniku("Odaberite platformu.");
  const p = procitajPostavke(u.postavke);
  if (!p.ok) throw new GreskaKorisniku(p.greska);
  if (u.wifiLozinka && (u.wifiLozinka.length < 8 || u.wifiLozinka.length > 63)) throw new GreskaKorisniku("Lozinka Wi-Fi mreže ima 8–63 znaka.");
  if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Profil ne postoji.");
  const f = a.firmaId;
  return db.$transaction(async (tx) => {
    await organizacijaFirme(tx, f, u.organizacijaId);
    const stari = id ? await tx.mdmProfil.findFirst({ where: { id, firmaId: f } }) : null;
    if (id && !stari) throw new GreskaKorisniku("Profil ne postoji.");
    const wifi = u.wifiLozinka === null ? undefined : u.wifiLozinka === "" ? null : sifriraj(u.wifiLozinka);
    const podaci = { naziv, organizacijaId: u.organizacijaId, platforma: u.platforma, postavke: p.vrijednost, aktivan: u.aktivan };
    const pid = stari
      ? (
          await tx.mdmProfil.update({
            where: { id: stari.id },
            data: { ...podaci, ...(wifi !== undefined ? { wifiLozinka: wifi } : {}), verzija: { increment: 1 } },
          })
        ).id
      : (
          await tx.mdmProfil.create({
            data: { firmaId: f, ...podaci, wifiLozinka: wifi ?? null, korisnikId: a.korisnikId, korisnik: await ime(tx, a) },
          })
        ).id;
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.upravljanje",
      entitet: "MdmProfil",
      entitetId: pid,
      opis: `${stari ? "Izmijenjen" : "Novi"} MDM profil ${naziv}${wifi !== undefined ? " (Wi-Fi lozinka promijenjena)" : ""}`,
      staro: stari ? { naziv: stari.naziv, postavke: stari.postavke, aktivan: stari.aktivan } : undefined,
      novo: { naziv, postavke: p.vrijednost, aktivan: u.aktivan },
    });
    return pid;
  });
}

// ——— aplikacije ———

export type UlazAplikacije = {
  naziv: string;
  paket: string;
  platforma: Platforma;
  verzija: string;
  verzijaKod: number;
  datoteka: { naziv: string; sadrzaj: Uint8Array };
};

export async function dodajAplikaciju(db: PrismaClient, a: Akter, u: UlazAplikacije): Promise<string> {
  const naziv = u.naziv.trim();
  const paket = u.paket.trim();
  const verzija = u.verzija.trim();
  if (!naziv || naziv.length > 120) throw new GreskaKorisniku("Upišite naziv aplikacije.");
  if (!/^[\w.{}\-]{2,200}$/.test(paket)) throw new GreskaKorisniku("Paket nije ispravan (npr. com.firma.aplikacija ili kod proizvoda MSI).");
  if (!verzija || verzija.length > 40) throw new GreskaKorisniku("Upišite verziju.");
  if (!Number.isSafeInteger(u.verzijaKod) || u.verzijaKod < 1) throw new GreskaKorisniku("Broj verzije mora biti cijeli broj veći od 0.");
  const nastavak = u.platforma === "ANDROID" ? ".apk" : ".msi";
  if (!u.datoteka.naziv.toLowerCase().endsWith(nastavak))
    throw new GreskaKorisniku(`Za ${u.platforma === "ANDROID" ? "Android" : "Windows"} odaberite ${nastavak.toUpperCase()} datoteku.`);
  if (u.datoteka.sadrzaj.byteLength === 0 || u.datoteka.sadrzaj.byteLength > NAJVECA_APLIKACIJA)
    throw new GreskaKorisniku("Datoteka je prazna ili veća od 150 MB.");
  const f = a.firmaId;
  return db.$transaction(
    async (tx) => {
      const zadnja = await tx.mdmAplikacija.findFirst({
        where: { firmaId: f, paket, platforma: u.platforma },
        orderBy: { verzijaKod: "desc" },
        select: { verzijaKod: true, verzija: true },
      });
      if (zadnja && zadnja.verzijaKod >= u.verzijaKod)
        throw new GreskaKorisniku(`Već postoji verzija ${zadnja.verzija} (broj ${zadnja.verzijaKod}) — nova mora imati veći broj verzije.`);
      const ap = await tx.mdmAplikacija.create({
        data: {
          firmaId: f,
          naziv,
          paket,
          platforma: u.platforma,
          verzija,
          verzijaKod: u.verzijaKod,
          nazivDatoteke: u.datoteka.naziv.slice(0, 200),
          sadrzaj: u.datoteka.sadrzaj as Uint8Array<ArrayBuffer>,
          velicina: u.datoteka.sadrzaj.byteLength,
          sha256: sha256(u.datoteka.sadrzaj),
          korisnikId: a.korisnikId,
          korisnik: await ime(tx, a),
        },
        select: { id: true },
      });
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: a.korisnikId,
        ip: a.ip,
        radnja: "mdm.upravljanje",
        entitet: "MdmAplikacija",
        entitetId: ap.id,
        opis: `MDM aplikacija ${naziv} ${verzija} (${paket}, ${u.platforma})${zadnja ? ` — nova verzija, stiže na uređaje pri sljedećem javljanju` : ""}`,
      });
      return ap.id;
    },
    { timeout: 60_000 },
  );
}

export async function dodijeliAplikaciju(
  db: PrismaClient,
  a: Akter,
  organizacijaId: string,
  u: { paket: string; platforma: Platforma },
  dodijeli: boolean,
) {
  const f = a.firmaId;
  await db.$transaction(async (tx) => {
    const o = (await organizacijaFirme(tx, f, organizacijaId))!;
    if (dodijeli) {
      if (!(await tx.mdmAplikacija.count({ where: { firmaId: f, paket: u.paket, platforma: u.platforma } })))
        throw new GreskaKorisniku("Aplikacija ne postoji.");
      await tx.mdmDodjela.upsert({
        where: { firmaId_organizacijaId_paket_platforma: { firmaId: f, organizacijaId, paket: u.paket, platforma: u.platforma } },
        create: { firmaId: f, organizacijaId, paket: u.paket, platforma: u.platforma },
        update: {},
      });
    } else await tx.mdmDodjela.deleteMany({ where: { firmaId: f, organizacijaId, paket: u.paket, platforma: u.platforma } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.upravljanje",
      entitet: "MdmOrganizacija",
      entitetId: organizacijaId,
      opis: `MDM ${o.naziv}: aplikacija ${u.paket} (${u.platforma}) ${dodijeli ? "dodijeljena" : "uklonjena iz dodjele"}`,
    });
  });
}

// ——— datoteke ———

export async function dodajDatoteku(
  db: PrismaClient,
  a: Akter,
  organizacijaId: string,
  u: { putanja: string; datoteka: { naziv: string; sadrzaj: Uint8Array } },
): Promise<string> {
  const putanja = u.putanja.trim();
  if (!putanja || putanja.length > 300 || putanja.includes("..")) throw new GreskaKorisniku("Upišite odredišnu mapu na uređaju (bez „..“).");
  const naziv = u.datoteka.naziv.replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
  if (!naziv) throw new GreskaKorisniku("Datoteka nema naziv.");
  if (u.datoteka.sadrzaj.byteLength === 0 || u.datoteka.sadrzaj.byteLength > NAJVECA_DATOTEKA)
    throw new GreskaKorisniku("Datoteka je prazna ili veća od 20 MB.");
  const f = a.firmaId;
  return db.$transaction(async (tx) => {
    const o = (await organizacijaFirme(tx, f, organizacijaId))!;
    const d = await tx.mdmDatoteka.create({
      data: {
        firmaId: f,
        organizacijaId,
        naziv,
        putanja,
        sadrzaj: u.datoteka.sadrzaj as Uint8Array<ArrayBuffer>,
        velicina: u.datoteka.sadrzaj.byteLength,
        sha256: sha256(u.datoteka.sadrzaj),
        korisnikId: a.korisnikId,
        korisnik: await ime(tx, a),
      },
      select: { id: true },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.upravljanje",
      entitet: "MdmOrganizacija",
      entitetId: organizacijaId,
      opis: `MDM ${o.naziv}: datoteka ${naziv} → ${putanja}`,
    });
    return d.id;
  });
}

export async function obrisiDatoteku(db: PrismaClient, a: Akter, id: string) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Datoteka ne postoji.");
  await db.$transaction(async (tx) => {
    const d = await tx.mdmDatoteka.findFirst({ where: { id, firmaId: a.firmaId }, select: { naziv: true, organizacijaId: true } });
    if (!d) throw new GreskaKorisniku("Datoteka ne postoji.");
    await tx.mdmDatoteka.delete({ where: { id } });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.upravljanje",
      entitet: "MdmOrganizacija",
      entitetId: d.organizacijaId,
      opis: `MDM: datoteka ${d.naziv} više se ne šalje uređajima`,
    });
  });
}

// ——— naredbe ———

export async function posaljiNaredbu(
  db: PrismaClient,
  a: Akter,
  mdmUredajId: string,
  vrsta: string,
  parametri: Record<string, unknown>,
): Promise<string> {
  if (!jeUuid(mdmUredajId)) throw new GreskaKorisniku("Uređaj ne postoji.");
  const f = a.firmaId;
  return db.$transaction(async (tx) => {
    const m = await tx.mdmUredaj.findFirst({ where: { id: mdmUredajId, firmaId: f }, select: { serijski: true, platforma: true, stanje: true } });
    if (!m) throw new GreskaKorisniku("Uređaj ne postoji.");
    if (m.stanje !== "AKTIVAN") throw new GreskaKorisniku("Uređaj je blokiran.");
    const n = provjeriNaredbu(vrsta, m.platforma as Platforma, parametri);
    if (!n.ok) throw new GreskaKorisniku(n.greska);
    if (VRSTE_NAREDBI[n.vrsta].puno && !imaPravo(a.prava, "mdm", "puno")) throw new GreskaKorisniku("Za ovu naredbu trebate puno pravo na MDM.");
    if (
      n.vrsta === "INSTALIRAJ" &&
      !(await tx.mdmAplikacija.count({ where: { id: n.parametri["aplikacijaId"]!, firmaId: f, platforma: m.platforma } }))
    )
      throw new GreskaKorisniku("Aplikacija ne postoji za ovu platformu.");
    const r = await tx.mdmNaredba.create({
      data: { firmaId: f, mdmUredajId, vrsta: n.vrsta, parametri: n.parametri, korisnikId: a.korisnikId, korisnik: await ime(tx, a) },
      select: { id: true },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.naredbe",
      entitet: "MdmUredaj",
      entitetId: mdmUredajId,
      opis: `MDM ${m.serijski}: naredba „${VRSTE_NAREDBI[n.vrsta].naziv}“`,
    });
    return r.id;
  });
}

export async function otkaziNaredbu(db: PrismaClient, a: Akter, id: string) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Naredba ne postoji.");
  await db.$transaction(async (tx) => {
    const n = await tx.mdmNaredba.findFirst({
      where: { id, firmaId: a.firmaId, status: { in: ["CEKA", "POSLANA"] } },
      select: { vrsta: true, status: true, mdmUredajId: true, uredaj: { select: { serijski: true } } },
    });
    if (!n) throw new GreskaKorisniku("Naredba je već izvršena ili ne postoji.");
    await tx.mdmNaredba.update({ where: { id }, data: { status: "OTKAZANA", zavrseno: new Date() } });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "mdm.naredbe",
      entitet: "MdmUredaj",
      entitetId: n.mdmUredajId,
      opis: `MDM ${n.uredaj.serijski}: otkazana naredba „${VRSTE_NAREDBI[n.vrsta as keyof typeof VRSTE_NAREDBI]?.naziv ?? n.vrsta}“`,
      staro: { status: n.status },
      novo: { status: "OTKAZANA" },
    });
  });
}

// ——— agent ———

export type OdgovorAgentu = {
  naredbe: { id: string; vrsta: string; parametri: unknown }[];
  profil: ({ verzija: number; wifiLozinka: string | null } & PostavkeProfila) | null;
  aplikacije: { id: string; paket: string; verzija: string; verzijaKod: number; sha256: string; velicina: number; adresa: string }[];
  datoteke: { id: string; naziv: string; putanja: string; sha256: string; velicina: number; adresa: string }[];
};

async function lanacUredaja(tx: Tx | PrismaClient, firmaId: string, organizacijaId: string) {
  const sve = await tx.mdmOrganizacija.findMany({ where: { firmaId }, select: { id: true, nadredenaId: true } });
  return lanacOrganizacija(sve, organizacijaId);
}

/**
 * Javljanje agenta: spremi izvještaj, stvori instalacije za zastarjele dodijeljene aplikacije,
 * vrati naredbe (čekaju → poslane), važeći profil, aplikacije i datoteke. null = token ne vrijedi.
 */
export async function javljanjeAgenta(db: PrismaClient, token: string | null, izvjestaj: unknown, sada = new Date()): Promise<OdgovorAgentu | null> {
  const m = await agentPoTokenu(db, token);
  if (!m) return null;
  const json = izvjestaj && typeof izvjestaj === "object" && !Array.isArray(izvjestaj) ? JSON.stringify(izvjestaj) : "{}";
  const spremi = json.length <= 32_768 ? (JSON.parse(json) as Prisma.InputJsonObject) : { greska: "Izvještaj je prevelik." };
  const f = m.firmaId;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "MdmUredaj" WHERE id = ${m.id}::uuid FOR UPDATE`;
    await tx.mdmUredaj.update({ where: { id: m.id }, data: { zadnjiKontakt: sada, izvjestaj: spremi } });
    const lanac = await lanacUredaja(tx, f, m.organizacijaId);
    const platforma = m.platforma as Platforma;
    const [dodjele, aplikacije, profili, datoteke] = await Promise.all([
      tx.mdmDodjela.findMany({ where: { firmaId: f, organizacijaId: { in: lanac }, platforma } }),
      tx.mdmAplikacija.findMany({
        where: { firmaId: f, platforma },
        select: { id: true, paket: true, platforma: true, verzija: true, verzijaKod: true, sha256: true, velicina: true },
      }),
      tx.mdmProfil.findMany({ where: { firmaId: f, platforma, aktivan: true, OR: [{ organizacijaId: null }, { organizacijaId: { in: lanac } }] } }),
      tx.mdmDatoteka.findMany({
        where: { firmaId: f, organizacijaId: { in: lanac } },
        select: { id: true, naziv: true, putanja: true, sha256: true, velicina: true },
      }),
    ]);
    const zeljene = zeljeneAplikacije(dodjele, aplikacije, lanac, platforma);
    const cekaju = await tx.mdmNaredba.findMany({
      where: { firmaId: f, mdmUredajId: m.id, vrsta: "INSTALIRAJ", status: { in: ["CEKA", "POSLANA"] } },
      select: { parametri: true },
    });
    // neuspjela instalacija ne ponavlja se sama 24 sata (inače svako javljanje = novo preuzimanje)
    const neuspjele = await tx.mdmNaredba.findMany({
      where: { firmaId: f, mdmUredajId: m.id, vrsta: "INSTALIRAJ", status: "GRESKA", zavrseno: { gte: new Date(sada.getTime() - 864e5) } },
      select: { parametri: true },
    });
    const cekajuId = new Set([...cekaju, ...neuspjele].map((n) => String((n.parametri as Record<string, unknown>)["aplikacijaId"])));
    // izvještaj bez popisa aplikacija ne pokreće instalacije (agent još nije poslao popis)
    if (spremi && typeof spremi === "object" && "aplikacije" in spremi) {
      for (const ap of potrebneInstalacije(zeljene, instaliraneIzIzvjestaja(spremi), cekajuId))
        await tx.mdmNaredba.create({
          data: { firmaId: f, mdmUredajId: m.id, vrsta: "INSTALIRAJ", parametri: { aplikacijaId: ap.id }, korisnik: "Sustav (nova verzija)" },
        });
    }
    const naredbe = await tx.mdmNaredba.findMany({
      where: { firmaId: f, mdmUredajId: m.id, status: { in: ["CEKA", "POSLANA"] } },
      orderBy: { stvoreno: "asc" },
      take: 50,
      select: { id: true, vrsta: true, parametri: true, status: true },
    });
    const nove = naredbe.filter((n) => n.status === "CEKA").map((n) => n.id);
    if (nove.length) await tx.mdmNaredba.updateMany({ where: { id: { in: nove } }, data: { status: "POSLANA", poslano: sada } });
    const p = vazeciProfil(profili, lanac, platforma);
    // ručna instalacija bilo koje verzije: agent treba i podatke za preuzimanje aplikacija iz naredbi
    const izNaredbi = new Set(
      naredbe.filter((n) => n.vrsta === "INSTALIRAJ").map((n) => String((n.parametri as Record<string, unknown>)["aplikacijaId"])),
    );
    const zaPreuzeti = [...zeljene, ...aplikacije.filter((x) => izNaredbi.has(x.id) && !zeljene.some((z) => z.id === x.id))];
    return {
      naredbe: naredbe.map((n) => ({ id: n.id, vrsta: n.vrsta, parametri: n.parametri })),
      profil: p ? { ...(p.postavke as PostavkeProfila), verzija: p.verzija, wifiLozinka: desifriraj(p.wifiLozinka) } : null,
      aplikacije: zaPreuzeti.map((x) => ({
        id: x.id,
        paket: x.paket,
        verzija: x.verzija,
        verzijaKod: x.verzijaKod,
        sha256: x.sha256,
        velicina: x.velicina,
        adresa: `/api/mdm/aplikacije/${x.id}`,
      })),
      datoteke: datoteke.map((d) => ({ ...d, adresa: `/api/mdm/datoteke/${d.id}` })),
    };
  });
}

/** Rezultat naredbe od agenta (samo za naredbe tog uređaja). */
export async function rezultatNaredbe(
  db: PrismaClient,
  token: string | null,
  u: { naredbaId: string; uspjeh: boolean; poruka: string | null },
  sada = new Date(),
): Promise<boolean> {
  const m = await agentPoTokenu(db, token);
  if (!m || !jeUuid(u.naredbaId)) return false;
  const r = await db.mdmNaredba.updateMany({
    where: { id: u.naredbaId, firmaId: m.firmaId, mdmUredajId: m.id, status: { in: ["CEKA", "POSLANA"] } },
    data: { status: u.uspjeh ? "IZVRSENA" : "GRESKA", rezultat: u.poruka?.slice(0, 2000) ?? null, zavrseno: sada },
  });
  return r.count > 0;
}

/** Zapisnik agenta (najviše 200 redaka po slanju). */
export async function zapisnikAgenta(db: PrismaClient, token: string | null, zapisi: unknown): Promise<number | null> {
  const m = await agentPoTokenu(db, token);
  if (!m) return null;
  const l = Array.isArray(zapisi) ? zapisi.slice(0, 200) : [];
  const redovi = l
    .filter((z): z is Record<string, unknown> => !!z && typeof z === "object")
    .map((z) => ({
      firmaId: m.firmaId,
      mdmUredajId: m.id,
      razina: ["INFO", "UPOZORENJE", "GRESKA"].includes(String(z["razina"])) ? String(z["razina"]) : "INFO",
      poruka: String(z["poruka"] ?? "").slice(0, 2000),
      vrijeme: typeof z["vrijeme"] === "string" && !Number.isNaN(Date.parse(z["vrijeme"])) ? new Date(z["vrijeme"]) : new Date(),
    }))
    .filter((z) => z.poruka);
  // najviše 2.000 redaka na sat po uređaju; stariji od 90 dana se brišu
  const sat = await db.mdmZapis.count({ where: { firmaId: m.firmaId, mdmUredajId: m.id, primljeno: { gte: new Date(Date.now() - 3600_000) } } });
  if (sat + redovi.length > 2000) throw new GreskaKorisniku("Previše zapisa — pokušajte kasnije.");
  await db.mdmZapis.deleteMany({ where: { firmaId: m.firmaId, mdmUredajId: m.id, vrijeme: { lt: new Date(Date.now() - 90 * 864e5) } } });
  if (redovi.length) await db.mdmZapis.createMany({ data: redovi });
  return redovi.length;
}

/** Snimka zaslona (PNG/JPEG) od agenta; naredba se označava izvršenom. */
export async function snimkaAgenta(db: PrismaClient, token: string | null, naredbaId: string | null, slika: Uint8Array): Promise<boolean> {
  const m = await agentPoTokenu(db, token);
  if (!m) return false;
  if (slika.byteLength === 0 || slika.byteLength > NAJVECA_SNIMKA) throw new GreskaKorisniku("Snimka je prazna ili prevelika.");
  const png = slika[0] === 0x89 && slika[1] === 0x50;
  const jpg = slika[0] === 0xff && slika[1] === 0xd8;
  if (!png && !jpg) throw new GreskaKorisniku("Snimka mora biti PNG ili JPEG.");
  await db.$transaction(async (tx) => {
    // snimka se prima samo kao odgovor na vlastitu naredbu koja još čeka (inače bi agent mogao puniti bazu)
    const n =
      naredbaId && jeUuid(naredbaId)
        ? await tx.mdmNaredba.findFirst({
            where: { id: naredbaId, firmaId: m.firmaId, mdmUredajId: m.id, vrsta: "SNIMI_ZASLON", status: { in: ["CEKA", "POSLANA"] } },
            select: { id: true },
          })
        : null;
    if (!n) throw new GreskaKorisniku("Nema naredbe za snimku zaslona.");
    await tx.mdmSnimka.create({
      data: {
        firmaId: m.firmaId,
        mdmUredajId: m.id,
        naredbaId: n.id,
        vrsta: png ? "image/png" : "image/jpeg",
        slika: slika as Uint8Array<ArrayBuffer>,
        velicina: slika.byteLength,
      },
    });
    await tx.mdmNaredba.update({ where: { id: n.id }, data: { status: "IZVRSENA", zavrseno: new Date() } });
  });
  return true;
}

/** Aplikacija za preuzimanje — samo ako je dodijeljena organizaciji uređaja (ili nekoj iznad) i iste platforme. */
export async function aplikacijaZaAgenta(db: PrismaClient, token: string | null, id: string) {
  const m = await agentPoTokenu(db, token);
  if (!m || !jeUuid(id)) return null;
  const ap = await db.mdmAplikacija.findFirst({ where: { id, firmaId: m.firmaId, platforma: m.platforma } });
  if (!ap) return null;
  const lanac = await lanacUredaja(db, m.firmaId, m.organizacijaId);
  const dodijeljena = await db.mdmDodjela.count({
    where: { firmaId: m.firmaId, organizacijaId: { in: lanac }, paket: ap.paket, platforma: ap.platforma },
  });
  const naredba = await db.mdmNaredba.count({
    where: { firmaId: m.firmaId, mdmUredajId: m.id, vrsta: "INSTALIRAJ", parametri: { equals: { aplikacijaId: id } } },
  });
  return dodijeljena || naredba ? ap : null;
}

export async function datotekaZaAgenta(db: PrismaClient, token: string | null, id: string) {
  const m = await agentPoTokenu(db, token);
  if (!m || !jeUuid(id)) return null;
  const lanac = await lanacUredaja(db, m.firmaId, m.organizacijaId);
  return db.mdmDatoteka.findFirst({ where: { id, firmaId: m.firmaId, organizacijaId: { in: lanac } } });
}
