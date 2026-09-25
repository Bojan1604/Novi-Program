import type { PrismaClient } from "@/generated/prisma/client";
import { danas, datum as uDatum, dodajMjesece, jeDatum, usporedi, type Datum } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { centiUDecimal, zbroji } from "@/domain/novac";
import { imaPosebno } from "@/domain/prava";
import { provjeriSerijski } from "@/domain/stanja-uredaja";
import { oznakaDokumenta } from "@/domain/zaprimanje";
import { GreskaKorisniku } from "@/lib/greske";
import { sljedeciBroj } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { stvoriUredaje, type NoviUredaj } from "./uredaji";

export const NAJVISE_UREDAJA_NA_PRIMCI = 5000;

export type StavkaZaprimanja = {
  serijski: string;
  modelId: string;
  /** centi; bez prava na nabavne cijene se zanemaruje */
  nabavnaCijena: number | null;
  cpu?: string | null;
  ram?: string | null;
  disk?: string | null;
  ekran?: string | null;
  os?: string | null;
  napomena?: string | null;
};

export type UlazPrimke = {
  datum: string;
  skladisteId: string;
  dobavljacId: string | null;
  stanjeRobeId: string | null;
  dokumentDobavljaca: string | null;
  napomena: string | null;
  knjiziUTroskove: boolean;
  stavke: StavkaZaprimanja[];
};

const d = (x: Datum) => new Date(`${x}T00:00:00Z`);

export async function zaprimi(db: PrismaClient, akter: Akter, ulaz: UlazPrimke, sada = new Date()): Promise<{ id: string; broj: string }> {
  if (!jeDatum(ulaz.datum)) throw new GreskaKorisniku("Datum primke nije ispravan.");
  const datum = uDatum(ulaz.datum);
  if (usporedi(datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum primke ne smije biti u budućnosti.");
  if (ulaz.stavke.length === 0) throw new GreskaKorisniku("Upišite barem jedan serijski broj.");
  if (ulaz.stavke.length > NAJVISE_UREDAJA_NA_PRIMCI) throw new GreskaKorisniku(`Najviše ${NAJVISE_UREDAJA_NA_PRIMCI} uređaja na jednoj primci.`);
  for (const id of [ulaz.skladisteId, ulaz.dobavljacId, ulaz.stanjeRobeId, ...ulaz.stavke.map((s) => s.modelId)]) {
    if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Neispravan odabir.");
  }
  const vidiNabavne = imaPosebno(akter.prava, "costs");

  // serijski: ispravni i bez dvostrukih u popisu
  const vidjeni = new Set<string>();
  const stavke = ulaz.stavke.map((s) => {
    const r = provjeriSerijski(s.serijski);
    if (!r.ok) throw new GreskaKorisniku(r.greska);
    if (vidjeni.has(r.vrijednost)) throw new GreskaKorisniku(`Serijski broj ${r.vrijednost} je upisan dvaput.`);
    vidjeni.add(r.vrijednost);
    if (s.nabavnaCijena !== null && (!Number.isSafeInteger(s.nabavnaCijena) || s.nabavnaCijena < 0))
      throw new GreskaKorisniku("Nabavna cijena nije ispravna.");
    return { ...s, serijski: r.vrijednost, nabavnaCijena: vidiNabavne ? s.nabavnaCijena : null };
  });

  return db.$transaction(
    async (tx) => {
      const f = akter.firmaId;
      const skladiste = await tx.skladiste.findFirst({ where: { id: ulaz.skladisteId, firmaId: f } });
      if (!skladiste?.aktivan) throw new GreskaKorisniku("Odaberite aktivno skladište.");
      if (ulaz.dobavljacId) {
        const dob = await tx.partner.findFirst({ where: { id: ulaz.dobavljacId, firmaId: f } });
        if (!dob?.aktivan || !dob.dobavljac) throw new GreskaKorisniku("Odabrani partner nije aktivan dobavljač.");
      }
      if (ulaz.stanjeRobeId && !(await tx.stanjeRobe.findFirst({ where: { id: ulaz.stanjeRobeId, firmaId: f, aktivan: true } }))) {
        throw new GreskaKorisniku("Odaberite aktivno stanje robe.");
      }
      const modelIdevi = [...new Set(stavke.map((s) => s.modelId))];
      const modeli = await tx.modelUredaja.findMany({
        where: { id: { in: modelIdevi }, firmaId: f, aktivan: true },
        select: { id: true, jamstvoMjeseci: true },
      });
      if (modeli.length !== modelIdevi.length) throw new GreskaKorisniku("Neki od odabranih modela ne postoje ili su deaktivirani.");
      const jamstvo = new Map(modeli.map((m) => [m.id, m.jamstvoMjeseci]));

      const godina = Number(datum.slice(0, 4));
      const redni = await sljedeciBroj(tx, f, "primka", godina);
      const broj = oznakaDokumenta("PRI", redni, godina);
      const nabavne = stavke.map((s) => s.nabavnaCijena).filter((c): c is number => c !== null);
      const primka = await tx.primka.create({
        data: {
          firmaId: f,
          broj,
          godina,
          redni,
          datum: d(datum),
          skladisteId: skladiste.id,
          dobavljacId: ulaz.dobavljacId,
          dokumentDobavljaca: ulaz.dokumentDobavljaca,
          napomena: ulaz.napomena,
          knjiziUTroskove: ulaz.knjiziUTroskove,
          brojUredaja: stavke.length,
          nabavnaVrijednost: vidiNabavne && nabavne.length ? centiUDecimal(zbroji(nabavne)) : null,
          korisnikId: akter.korisnikId,
          korisnik: (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat",
        },
      });
      const novi: NoviUredaj[] = stavke.map((s) => ({
        serijski: s.serijski,
        modelId: s.modelId,
        nabavnaCijena: s.nabavnaCijena === null ? null : centiUDecimal(s.nabavnaCijena),
        nabavniDatum: d(datum),
        jamstvoDo: d(dodajMjesece(datum, jamstvo.get(s.modelId) ?? 0)),
        stanjeRobeId: ulaz.stanjeRobeId,
        cpu: s.cpu ?? null,
        ram: s.ram ?? null,
        disk: s.disk ?? null,
        ekran: s.ekran ?? null,
        os: s.os ?? null,
        napomena: s.napomena ?? null,
      }));
      await stvoriUredaje(tx, { firmaId: f, korisnikId: akter.korisnikId }, "zaprimanje", novi, {
        skladisteId: skladiste.id,
        primkaId: primka.id,
        dokument: { vrsta: "Primka", id: primka.id, broj },
      });
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "primke.zaprimi",
        entitet: "Primka",
        entitetId: primka.id,
        opis: `Primka ${broj}: zaprimljeno ${stavke.length} uređaja na ${skladiste.naziv}`,
        novo: {
          broj,
          datum,
          skladiste: skladiste.naziv,
          brojUredaja: stavke.length,
          nabavnaVrijednost: primka.nabavnaVrijednost?.toString() ?? null,
        },
      });
      return { id: primka.id, broj };
    },
    { timeout: 120_000 },
  );
}

/**
 * Storno primke: samo dok se nijedan uređaj s nje nije pomaknuo (samo događaj zaprimanja).
 * Uređaji i njihovi događaji se brišu, primka ostaje kao STORNIRANA (broj se ne ponavlja).
 */
export async function stornirajPrimku(db: PrismaClient, akter: Akter, id: string): Promise<void> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Primka ne postoji.");
  await db.$transaction(async (tx) => {
    const f = akter.firmaId;
    await tx.$queryRaw`SELECT id FROM "Primka" WHERE id = ${id}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const p = await tx.primka.findFirst({ where: { id, firmaId: f } });
    if (!p) throw new GreskaKorisniku("Primka ne postoji.");
    if (p.status === "STORNIRANA") throw new GreskaKorisniku("Primka je već stornirana.");
    const uredaji = await tx.uredaj.findMany({
      where: { primkaId: id, firmaId: f },
      select: { id: true, serijski: true, stanje: true, _count: { select: { dogadaji: true } } },
    });
    const pomaknuti = uredaji.filter((u) => u.stanje !== "NA_SKLADISTU" || u._count.dogadaji > 1);
    if (pomaknuti.length) {
      throw new GreskaKorisniku(
        `Primka se ne može stornirati: uređaji su već korišteni (${pomaknuti
          .slice(0, 5)
          .map((u) => u.serijski)
          .join(", ")}${pomaknuti.length > 5 ? " …" : ""}).`,
      );
    }
    await tx.$queryRaw`SELECT id FROM "Uredaj" WHERE "primkaId" = ${id}::uuid ORDER BY id FOR UPDATE`;
    await tx.dogadajUredaja.deleteMany({ where: { firmaId: f, uredajId: { in: uredaji.map((u) => u.id) } } });
    await tx.uredaj.deleteMany({ where: { firmaId: f, primkaId: id } });
    await tx.primka.update({ where: { id }, data: { status: "STORNIRANA" } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "primke.storno",
      entitet: "Primka",
      entitetId: id,
      opis: `Stornirana primka ${p.broj} (${uredaji.length} uređaja uklonjeno)`,
      staro: { status: p.status },
      novo: { status: "STORNIRANA" },
    });
  });
}

/** Koji od serijskih brojeva već postoje (za pregled prije zaprimanja). */
export async function postojeciSerijski(db: PrismaClient, firmaId: string, serijski: string[]) {
  if (serijski.length === 0) return [];
  const r = await db.uredaj.findMany({
    where: { firmaId, serijski: { in: serijski.slice(0, NAJVISE_UREDAJA_NA_PRIMCI) } },
    select: { serijski: true, stanje: true, primka: { select: { broj: true } } },
  });
  return r.map((u) => ({ serijski: u.serijski, stanje: u.stanje, primka: u.primka?.broj ?? null }));
}
