import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { jeDatum, usporedi } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import { procitajOib } from "@/domain/oib";
import { trosakNarudzbenice } from "@/domain/trosak-robe";
import { oznakaDokumenta } from "@/domain/zaprimanje";
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
