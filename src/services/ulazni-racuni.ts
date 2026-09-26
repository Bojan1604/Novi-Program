import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { jeDatum, usporedi } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import { procitajOib } from "@/domain/oib";
import { trosakNarudzbenice } from "@/domain/trosak-robe";
import { oznakaDokumenta } from "@/domain/zaprimanje";
import { procitajUbl } from "@/lib/eracun/citanje";
import { demoPrimiUlazni, posrednik } from "@/lib/eracun/posrednik";
import { ublXml } from "@/lib/eracun/ubl";
import { GreskaKorisniku } from "@/lib/greske";
import { sljedeciBroj } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

type Tx = Prisma.TransactionClient;
const d = (x: string) => new Date(`${x}T00:00:00Z`);
const c = (x: Prisma.Decimal | null) => (x ? centiIzDecimala(x.toFixed(2)) : 0);

export type UlazUlaznogRacuna = {
  broj: string;
  datum: string;
  dospijece: string | null;
  dobavljacId: string | null;
  dobavljacTekst: string | null;
  dobavljacOib: string | null;
  narudzbenicaId: string | null;
  primkaId: string | null;
  zaRobu: boolean;
  /** centi */
  osnovica: number;
  pdv: number;
  opis: string | null;
  verzija: number;
};

/** Trošak robe po narudžbenici (primke i ulazni računi) — isto pravilo kao domain/trosak-robe.ts. */
export async function trosakPoNarudzbenici(tx: Tx | PrismaClient, firmaId: string, narudzbenicaId: string) {
  const [primke, racuni] = await Promise.all([
    tx.primka.findMany({ where: { firmaId, narudzbenicaId }, select: { id: true, status: true, nabavnaVrijednost: true } }),
    tx.ulazniRacun.findMany({ where: { firmaId, narudzbenicaId }, select: { id: true, status: true, zaRobu: true, osnovica: true } }),
  ]);
  return trosakNarudzbenice({
    primke: primke.map((p) => ({ id: p.id, iznos: c(p.nabavnaVrijednost), aktivna: p.status === "IZDANA" })),
    racuni: racuni.map((r) => ({ id: r.id, iznos: c(r.osnovica), zaRobu: r.zaRobu, aktivan: ["EVIDENTIRAN", "PRIHVACEN"].includes(r.status) })),
  });
}

function provjeri(u: UlazUlaznogRacuna): Record<string, string> {
  const g: Record<string, string> = {};
  if (!u.broj.trim()) g["broj"] = "Upišite broj računa dobavljača.";
  if (u.broj.length > 100) g["broj"] = "Broj je predug.";
  if (!jeDatum(u.datum)) g["datum"] = "Datum nije ispravan.";
  if (u.dospijece !== null && (!jeDatum(u.dospijece) || (jeDatum(u.datum) && usporedi(u.dospijece, u.datum) < 0)))
    g["dospijece"] = "Dospijeće ne smije biti prije datuma.";
  if (!u.dobavljacId && !u.dobavljacTekst?.trim()) g["dobavljac"] = "Odaberite dobavljača ili upišite naziv.";
  if (u.dobavljacOib) {
    const o = procitajOib(u.dobavljacOib);
    if (!o.ok) g["dobavljacOib"] = o.greska;
  }
  if (!Number.isSafeInteger(u.osnovica)) g["osnovica"] = "Osnovica nije ispravna.";
  if (!Number.isSafeInteger(u.pdv) || u.pdv < 0) g["pdv"] = "PDV nije ispravan.";
  return g;
}

/** Evidentiranje ili izmjena ručnog ulaznog računa. Oznaka „račun za robu“ se sprema i čuva u svim tokovima. */
export async function spremiUlazniRacun(
  db: PrismaClient,
  akter: Akter,
  id: string | null,
  u: UlazUlaznogRacuna,
): Promise<{ ok: true; id: string } | { ok: false; polja: Record<string, string> }> {
  const polja = provjeri(u);
  for (const x of [u.dobavljacId, u.narudzbenicaId, u.primkaId]) if (x !== null && !jeUuid(x)) polja["veza"] = "Neispravan odabir.";
  if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Ulazni račun ne postoji.");
  if (Object.keys(polja).length) return { ok: false, polja };
  const f = akter.firmaId;
  return db.$transaction(async (tx): Promise<{ ok: true; id: string } | { ok: false; polja: Record<string, string> }> => {
    if (u.dobavljacId && !(await tx.partner.count({ where: { id: u.dobavljacId, firmaId: f } })))
      return { ok: false, polja: { dobavljac: "Dobavljač ne postoji." } };
    if (u.narudzbenicaId) {
      const n = await tx.narudzbenica.findFirst({ where: { id: u.narudzbenicaId, firmaId: f }, select: { dobavljacId: true } });
      if (!n) return { ok: false, polja: { narudzbenicaId: "Narudžbenica ne postoji." } };
      if (u.dobavljacId && n.dobavljacId !== u.dobavljacId) return { ok: false, polja: { narudzbenicaId: "Narudžbenica je drugog dobavljača." } };
    }
    if (
      u.primkaId &&
      !(await tx.primka.count({ where: { id: u.primkaId, firmaId: f, ...(u.narudzbenicaId ? { narudzbenicaId: u.narudzbenicaId } : {}) } }))
    )
      return { ok: false, polja: { primkaId: "Primka ne postoji ili nije po toj narudžbenici." } };
    const podaci = {
      broj: u.broj.trim(),
      datum: d(u.datum),
      dospijece: u.dospijece ? d(u.dospijece) : null,
      dobavljacId: u.dobavljacId,
      dobavljacTekst: u.dobavljacId ? null : u.dobavljacTekst?.trim() || null,
      dobavljacOib: u.dobavljacOib ? (procitajOib(u.dobavljacOib) as { vrijednost: string }).vrijednost : null,
      narudzbenicaId: u.narudzbenicaId,
      primkaId: u.primkaId,
      zaRobu: u.zaRobu,
      osnovica: centiUDecimal(u.osnovica),
      pdv: centiUDecimal(u.pdv),
      ukupno: centiUDecimal(u.osnovica + u.pdv),
      opis: u.opis?.trim() || null,
    };
    let racunId: string;
    let opis: string;
    if (id) {
      await tx.$queryRaw`SELECT id FROM "UlazniRacun" WHERE id = ${id}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
      const s = await tx.ulazniRacun.findFirst({ where: { id, firmaId: f } });
      if (!s) throw new GreskaKorisniku("Ulazni račun ne postoji.");
      if (s.verzija !== u.verzija) throw new GreskaKorisniku("Netko je u međuvremenu promijenio račun. Osvježite stranicu.");
      if (s.status !== "EVIDENTIRAN" && s.status !== "PRIHVACEN") throw new GreskaKorisniku("Ovaj račun se više ne mijenja.");
      // eRačun: iznosi i dobavljač su s računa — mijenjaju se samo veze, oznaka i opis
      const zadrzi =
        s.izvor === "ERACUN"
          ? {
              broj: s.broj,
              datum: s.datum,
              osnovica: s.osnovica,
              pdv: s.pdv,
              ukupno: s.ukupno,
              dobavljacId: s.dobavljacId,
              dobavljacTekst: s.dobavljacTekst,
              dobavljacOib: s.dobavljacOib,
            }
          : {};
      await tx.ulazniRacun.update({ where: { id }, data: { ...podaci, ...zadrzi, verzija: { increment: 1 } } });
      racunId = id;
      opis = `Izmijenjen ulazni račun ${s.interni}${s.zaRobu !== u.zaRobu ? ` (račun za robu: ${u.zaRobu ? "da" : "ne"})` : ""}`;
    } else {
      const godina = Number(u.datum.slice(0, 4));
      const redni = await sljedeciBroj(tx, f, "ulazniRacun", godina);
      const interni = oznakaDokumenta("URA", redni, godina);
      const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
      racunId = (
        await tx.ulazniRacun.create({
          data: { ...podaci, firmaId: f, interni, godina, redni, korisnikId: akter.korisnikId, korisnik: ime },
          select: { id: true },
        })
      ).id;
      opis = `Ulazni račun ${interni} (${podaci.broj})${u.zaRobu ? ", račun za robu" : ""}`;
    }
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "ulazni.spremi",
      entitet: "UlazniRacun",
      entitetId: racunId,
      opis,
    });
    return { ok: true, id: racunId };
  });
}

/** Storno ručnog ulaznog računa (npr. krivo upisan): ostaje zapisan, ne ulazi u trošak. */
export async function stornirajUlazniRacun(db: PrismaClient, akter: Akter, id: string, razlog: string) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Ulazni račun ne postoji.");
  if (!razlog.trim()) throw new GreskaKorisniku("Upišite razlog.");
  const f = akter.firmaId;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "UlazniRacun" WHERE id = ${id}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const s = await tx.ulazniRacun.findFirst({ where: { id, firmaId: f } });
    if (!s) throw new GreskaKorisniku("Ulazni račun ne postoji.");
    if (s.izvor !== "RUCNI") throw new GreskaKorisniku("eRačun se ne stornira — odbija se s razlogom.");
    if (s.status === "STORNIRAN") throw new GreskaKorisniku("Račun je već storniran.");
    if (c(s.placeno) !== 0) throw new GreskaKorisniku("Račun ima plaćanja — prvo ih poništite.");
    await tx.ulazniRacun.update({
      where: { id },
      data: { status: "STORNIRAN", razlogOdbijanja: razlog.trim().slice(0, 500), verzija: { increment: 1 } },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "ulazni.storno",
      entitet: "UlazniRacun",
      entitetId: id,
      opis: `Storniran ulazni račun ${s.interni}: ${razlog.trim()}`,
      staro: { status: s.status },
      novo: { status: "STORNIRAN" },
    });
  });
}

// ——— ulazni eRačun (korak 4.4) ———

/**
 * Preuzimanje ulaznih eRačuna od posrednika: svaki postaje ulazni račun „čeka prihvat“ (isti se ne preuzima dvaput).
 * Dobavljač se prepoznaje po OIB-u; odobrenje dobavljača ima negativne iznose.
 */
export async function preuzmiERacune(db: PrismaClient, akter: Akter): Promise<{ preuzeto: number; preskoceno: string[] }> {
  const f = akter.firmaId;
  const firma = await db.firma.findUniqueOrThrow({ where: { id: f }, select: { oib: true } });
  const primljeni = await posrednik().preuzmi(firma.oib);
  let preuzeto = 0;
  const preskoceno: string[] = [];
  for (const e of primljeni) {
    let r: ReturnType<typeof procitajUbl>;
    try {
      r = procitajUbl(e.xml);
    } catch (g) {
      preskoceno.push(`${e.id}: ${g instanceof Error ? g.message : "neispravan"}`);
      continue;
    }
    if (r.kupacOib && r.kupacOib !== firma.oib) {
      preskoceno.push(`${r.broj}: eRačun nije za ovu firmu (OIB kupca ${r.kupacOib})`);
      continue;
    }
    const zn = r.vrsta === "ODOBRENJE" ? -1 : 1;
    await db.$transaction(async (tx) => {
      if (await tx.ulazniRacun.count({ where: { firmaId: f, eRacunId: e.id } })) return;
      const dob = r.dobavljac.oib ? await tx.partner.findFirst({ where: { firmaId: f, oib: r.dobavljac.oib }, select: { id: true } }) : null;
      const godina = Number(r.datum.slice(0, 4));
      const redni = await sljedeciBroj(tx, f, "ulazniRacun", godina);
      const interni = oznakaDokumenta("URA", redni, godina);
      const n = await tx.ulazniRacun.create({
        data: {
          firmaId: f,
          interni,
          godina,
          redni,
          broj: r.broj,
          datum: d(r.datum),
          dospijece: r.dospijece ? d(r.dospijece) : null,
          dobavljacId: dob?.id ?? null,
          dobavljacTekst: dob ? null : r.dobavljac.naziv,
          dobavljacOib: r.dobavljac.oib,
          osnovica: centiUDecimal(zn * r.osnovica),
          pdv: centiUDecimal(zn * r.pdv),
          ukupno: centiUDecimal(zn * r.ukupno),
          opis: r.vrsta === "ODOBRENJE" ? "Odobrenje dobavljača" : null,
          izvor: "ERACUN",
          status: "PRIMLJEN",
          eRacunId: e.id,
          xml: e.xml,
          korisnikId: akter.korisnikId,
          korisnik: "Posrednik",
        },
        select: { id: true },
      });
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "ulazni.preuzmi",
        entitet: "UlazniRacun",
        entitetId: n.id,
        opis: `Preuzet ulazni eRačun ${r.broj} (${r.dobavljac.naziv}) kao ${interni}`,
      });
      preuzeto++;
    });
  }
  return { preuzeto, preskoceno };
}

async function zakljucajUlazni(tx: Tx, firmaId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "UlazniRacun" WHERE id = ${id}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
  const r = await tx.ulazniRacun.findFirst({ where: { id, firmaId } });
  if (!r) throw new GreskaKorisniku("Ulazni račun ne postoji.");
  return r;
}

/**
 * Prihvat eRačuna: veza s narudžbenicom/primkom i oznaka „račun za robu“. Trošak robe se računa pravilom
 * (veći od primki i računa), pa se knjiži samo razlika iznad već zaprimljenog — vraća tu razliku.
 */
export async function prihvatiERacun(
  db: PrismaClient,
  akter: Akter,
  id: string,
  u: { narudzbenicaId: string | null; primkaId: string | null; zaRobu: boolean },
): Promise<{ razlikaRobe: number }> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Ulazni račun ne postoji.");
  for (const x of [u.narudzbenicaId, u.primkaId]) if (x !== null && !jeUuid(x)) throw new GreskaKorisniku("Neispravan odabir.");
  const f = akter.firmaId;
  const r = await db.$transaction(async (tx) => {
    const r = await zakljucajUlazni(tx, f, id);
    if (r.status !== "PRIMLJEN") throw new GreskaKorisniku("eRačun je već obrađen.");
    if (u.narudzbenicaId) {
      await tx.$queryRaw`SELECT id FROM "Narudzbenica" WHERE id = ${u.narudzbenicaId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
      const n = await tx.narudzbenica.findFirst({ where: { id: u.narudzbenicaId, firmaId: f }, select: { dobavljacId: true } });
      if (!n) throw new GreskaKorisniku("Narudžbenica ne postoji.");
      if (r.dobavljacId && r.dobavljacId !== n.dobavljacId) throw new GreskaKorisniku("Narudžbenica je drugog dobavljača.");
    }
    if (
      u.primkaId &&
      !(await tx.primka.count({ where: { id: u.primkaId, firmaId: f, ...(u.narudzbenicaId ? { narudzbenicaId: u.narudzbenicaId } : {}) } }))
    )
      throw new GreskaKorisniku("Primka ne postoji ili nije po toj narudžbenici.");
    const prije = u.narudzbenicaId ? (await trosakPoNarudzbenici(tx, f, u.narudzbenicaId)).roba : 0;
    await tx.ulazniRacun.update({
      where: { id },
      data: { status: "PRIHVACEN", narudzbenicaId: u.narudzbenicaId, primkaId: u.primkaId, zaRobu: u.zaRobu, verzija: { increment: 1 } },
    });
    const poslije = u.narudzbenicaId ? (await trosakPoNarudzbenici(tx, f, u.narudzbenicaId)).roba : 0;
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "ulazni.prihvat",
      entitet: "UlazniRacun",
      entitetId: id,
      opis: `Prihvaćen eRačun ${r.broj} (${r.interni})${u.zaRobu ? `, račun za robu — trošak robe +${((poslije - prije) / 100).toFixed(2)} €` : ""}`,
    });
    return { eRacunId: r.eRacunId, razlikaRobe: poslije - prije };
  });
  if (r.eRacunId) await posrednik().odgovori(r.eRacunId, "PRIHVACEN", null);
  return { razlikaRobe: r.razlikaRobe };
}

/** Odbijanje eRačuna s razlogom: posrednik javlja pošiljatelju, a Poreznoj ide izvještaj o odbijanju. */
export async function odbijERacun(db: PrismaClient, akter: Akter, id: string, razlog: string, sada = new Date()) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Ulazni račun ne postoji.");
  const tekst = razlog.trim();
  if (tekst.length < 5) throw new GreskaKorisniku("Upišite razlog odbijanja.");
  const f = akter.firmaId;
  const r = await db.$transaction(async (tx) => {
    const r = await zakljucajUlazni(tx, f, id);
    if (r.status !== "PRIMLJEN") throw new GreskaKorisniku("eRačun je već obrađen.");
    await tx.ulazniRacun.update({ where: { id }, data: { status: "ODBIJEN", razlogOdbijanja: tekst.slice(0, 500), verzija: { increment: 1 } } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "ulazni.odbij",
      entitet: "UlazniRacun",
      entitetId: id,
      opis: `Odbijen eRačun ${r.broj} (${r.interni}): ${tekst}`,
    });
    return r;
  });
  const p = posrednik();
  if (r.eRacunId) await p.odgovori(r.eRacunId, "ODBIJEN", tekst);
  const iz = await p.izvijesti({
    vrsta: "ODBIJANJE",
    broj: r.broj,
    oibIzdavatelja: r.dobavljacOib ?? "",
    iznos: r.ukupno.toFixed(2),
    datum: sada.toISOString().slice(0, 10),
    razlog: tekst,
  });
  await db.ulazniRacun.updateMany({ where: { id, firmaId: f }, data: { izvjestajId: iz.id } });
}

/** Plaćanje ulaznog računa: eRačun tek nakon prihvata; ne više od otvorenog iznosa. */
export async function platiUlazni(db: PrismaClient, akter: Akter, id: string, u: { datum: string; iznos: number }) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Ulazni račun ne postoji.");
  if (!jeDatum(u.datum)) throw new GreskaKorisniku("Datum plaćanja nije ispravan.");
  if (!Number.isSafeInteger(u.iznos) || u.iznos <= 0) throw new GreskaKorisniku("Upišite iznos.");
  const f = akter.firmaId;
  await db.$transaction(async (tx) => {
    const r = await zakljucajUlazni(tx, f, id);
    if (r.status === "PRIMLJEN") throw new GreskaKorisniku("eRačun se plaća tek nakon prihvata.");
    if (r.status !== "EVIDENTIRAN" && r.status !== "PRIHVACEN") throw new GreskaKorisniku("Ovaj račun se ne plaća.");
    const otvoreno = c(r.ukupno) - c(r.placeno);
    if (u.iznos > otvoreno) throw new GreskaKorisniku(`Najviše ${(otvoreno / 100).toFixed(2).replace(".", ",")} € (otvoreno).`);
    const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    await tx.placanjeUlaznog.create({
      data: { firmaId: f, ulazniRacunId: id, datum: d(u.datum), iznos: centiUDecimal(u.iznos), korisnikId: akter.korisnikId, korisnik: ime },
    });
    await tx.ulazniRacun.update({ where: { id }, data: { placeno: centiUDecimal(c(r.placeno) + u.iznos), verzija: { increment: 1 } } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "ulazni.plati",
      entitet: "UlazniRacun",
      entitetId: id,
      opis: `Plaćeno ${(u.iznos / 100).toFixed(2)} € — ${r.interni}`,
    });
  });
}

/** Demo: primjer ulaznog eRačuna u pretincu demo posrednika (za isprobavanje bez pravog posrednika). */
export async function demoPrimjerERacuna(db: PrismaClient, akter: Akter, sada = new Date()): Promise<void> {
  if ((process.env["ERACUN_POSREDNIK"] ?? "demo") !== "demo") throw new GreskaKorisniku("Primjer postoji samo uz demo posrednika.");
  const firma = await db.firma.findUniqueOrThrow({ where: { id: akter.firmaId } });
  const datum = sada.toISOString().slice(0, 10);
  const xml = ublXml({
    vrsta: "RACUN",
    broj: `DEMO-${sada.getTime().toString().slice(-6)}`,
    datum,
    vrijeme: "10:00:00",
    dospijece: datum,
    prodavatelj: {
      naziv: "Demo dobavljač d.o.o.",
      oib: "94577403194",
      pdvBroj: null,
      adresa: "Savska 1",
      postanskiBroj: "10000",
      mjesto: "Zagreb",
      drzava: "HR",
      uSustavuPdv: true,
      iban: "HR1210010051863000160",
    },
    operater: { ime: "Demo", oib: "94577403194" },
    kupac: {
      naziv: firma.naziv,
      oib: firma.oib,
      pdvBroj: null,
      adresa: firma.adresa,
      postanskiBroj: firma.postanskiBroj,
      mjesto: firma.mjesto,
      drzava: "HR",
    },
    izvorni: null,
    nacinPlacanja: "T",
    pozivNaBroj: null,
    napomene: [],
    stavke: [{ naziv: "Toner", opis: null, kpd: "20.59.12", jedinica: "kom", kolicina: 2000, cijena: 5000, iznos: 10000, ublKod: "S", stopa: 2500 }],
    poKategoriji: [{ ublKod: "S", stopa: 2500, osnovica: 10000, pdv: 2500, vatex: null, tekst: null }],
    osnovica: 10000,
    pdv: 2500,
    ukupno: 12500,
    pdf: null,
  });
  demoPrimiUlazni(firma.oib, xml);
}
