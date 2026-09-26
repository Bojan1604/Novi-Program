import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { danas, jeDatum, usporedi } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import { ukupnoZaPlacanje } from "@/domain/odobrenja";
import { provjeriUplatu, stanjePlacanja } from "@/domain/uplate";
import { GreskaKorisniku } from "@/lib/greske";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

type Tx = Prisma.TransactionClient;

const PLATIVI = ["RACUN", "ODOBRENJE", "PREDUJAM"];

async function zakljucajDokument(tx: Tx, firmaId: string, dokumentId: string) {
  await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${dokumentId}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
  const d = await tx.prodajniDokument.findFirst({
    where: { id: dokumentId, firmaId },
    select: { id: true, vrsta: true, status: true, broj: true, ukupno: true, uplate: { select: { iznos: true, ponistena: true } } },
  });
  if (!d) throw new GreskaKorisniku("Račun ne postoji.");
  return {
    ...d,
    // storniran račun više se ne naplaćuje — sve plaćeno po njemu je „za povrat“
    ukupnoC: ukupnoZaPlacanje(d.vrsta, d.status, centiIzDecimala(d.ukupno.toFixed(2))),
    uplateC: d.uplate.map((u) => ({ iznos: centiIzDecimala(u.iznos.toFixed(2)), ponistena: u.ponistena })),
  };
}

async function osvjeziPlaceno(tx: Tx, firmaId: string, dokumentId: string, ukupno: number) {
  const uplate = await tx.uplata.findMany({ where: { firmaId, dokumentId }, select: { iznos: true, ponistena: true } });
  const s = stanjePlacanja(
    ukupno,
    uplate.map((u) => ({ iznos: centiIzDecimala(u.iznos.toFixed(2)), ponistena: u.ponistena })),
  );
  await tx.prodajniDokument.update({ where: { id: dokumentId }, data: { placeno: centiUDecimal(s.placeno) } });
  return s;
}

export type UlazUplate = { datum: string; iznos: number; nacin: string; opis: string | null };

/** Uplata (pozitivan iznos) ili povrat kupcu (negativan, najviše do preplate). Račun zaključan dok se upisuje. */
export async function dodajUplatu(db: PrismaClient, akter: Akter, dokumentId: string, u: UlazUplate, sada = new Date()) {
  if (!jeUuid(dokumentId)) throw new GreskaKorisniku("Račun ne postoji.");
  if (!jeDatum(u.datum)) throw new GreskaKorisniku("Datum uplate nije ispravan.");
  if (usporedi(u.datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum uplate ne smije biti u budućnosti.");
  if (!["T", "G", "K", "O"].includes(u.nacin)) throw new GreskaKorisniku("Odaberite način plaćanja.");
  return db.$transaction(async (tx) => {
    const d = await zakljucajDokument(tx, akter.firmaId, dokumentId);
    if (!PLATIVI.includes(d.vrsta) || d.status === "NACRT") throw new GreskaKorisniku("Uplata se upisuje samo na izdani račun.");
    const g = provjeriUplatu(d.ukupnoC, d.uplateC, u.iznos);
    if (g) throw new GreskaKorisniku(g);
    const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    const up = await tx.uplata.create({
      data: {
        firmaId: akter.firmaId,
        dokumentId,
        datum: new Date(`${u.datum}T00:00:00Z`),
        iznos: centiUDecimal(u.iznos),
        nacin: u.nacin,
        opis: u.opis?.trim() || null,
        korisnikId: akter.korisnikId,
        korisnik: ime,
      },
    });
    const s = await osvjeziPlaceno(tx, akter.firmaId, dokumentId, d.ukupnoC);
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: u.iznos > 0 ? "uplate.dodaj" : "uplate.povrat",
      entitet: "ProdajniDokument",
      entitetId: dokumentId,
      opis: `${u.iznos > 0 ? "Uplata" : "Povrat kupcu"} ${(Math.abs(u.iznos) / 100).toFixed(2)} € — ${d.broj}`,
      novo: { uplataId: up.id, iznos: centiUDecimal(u.iznos), otvoreno: centiUDecimal(s.otvoreno), zaPovrat: centiUDecimal(s.zaPovrat) },
    });
    return s;
  });
}

/** Poništavanje uplate (pogrešan upis): ostaje zapisana kao poništena, s razlogom. */
export async function ponistiUplatu(db: PrismaClient, akter: Akter, uplataId: string, razlog: string) {
  if (!jeUuid(uplataId)) throw new GreskaKorisniku("Uplata ne postoji.");
  const r = razlog.trim();
  if (!r) throw new GreskaKorisniku("Upišite razlog poništavanja.");
  return db.$transaction(async (tx) => {
    const up = await tx.uplata.findFirst({ where: { id: uplataId, firmaId: akter.firmaId } });
    if (!up) throw new GreskaKorisniku("Uplata ne postoji.");
    const d = await zakljucajDokument(tx, akter.firmaId, up.dokumentId);
    const svjeza = await tx.uplata.findUniqueOrThrow({ where: { id: uplataId } });
    if (svjeza.ponistena) throw new GreskaKorisniku("Uplata je već poništena.");
    await tx.uplata.update({ where: { id: uplataId }, data: { ponistena: true, razlogPonistenja: r.slice(0, 500) } });
    const s = await osvjeziPlaceno(tx, akter.firmaId, up.dokumentId, d.ukupnoC);
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "uplate.ponisti",
      entitet: "ProdajniDokument",
      entitetId: up.dokumentId,
      opis: `Poništena uplata ${up.iznos.toFixed(2)} € — ${d.broj}: ${r}`,
      staro: { uplataId, ponistena: false },
      novo: { uplataId, ponistena: true },
    });
    return s;
  });
}
