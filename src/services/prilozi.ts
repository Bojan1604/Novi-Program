import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { NAZIVI_ENTITETA } from "@/domain/dnevnik";
import { jeUuid } from "@/domain/id";
import { NAJVISE_PRILOGA, provjeriPrilog } from "@/domain/prilozi";
import { GreskaKorisniku } from "@/lib/greske";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

type Tx = Prisma.TransactionClient;

/** Zapisi uz koje se smiju vezati prilozi: postoji li zapis u firmi (i zaključaj ga dok se dodaje). */
const VLASNICI: Record<string, (tx: Tx, firmaId: string, id: string) => Promise<string | null>> = {
  Uredaj: async (tx, firmaId, id) => {
    const r = await tx.$queryRaw<
      { serijski: string }[]
    >`SELECT serijski FROM "Uredaj" WHERE id = ${id}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
    return r[0] ? `uređaj ${r[0].serijski}` : null;
  },
  UlazniRacun: async (tx, firmaId, id) => {
    const r = await tx.$queryRaw<
      { interni: string }[]
    >`SELECT interni FROM "UlazniRacun" WHERE id = ${id}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
    return r[0] ? `ulazni račun ${r[0].interni}` : null;
  },
  UgovorNajma: async (tx, firmaId, id) => {
    const r = await tx.$queryRaw<
      { broj: string }[]
    >`SELECT broj FROM "UgovorNajma" WHERE id = ${id}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
    return r[0] ? `ugovor ${r[0].broj}` : null;
  },
};

export type Datoteka = { naziv: string; velicina: number; sadrzaj: Uint8Array };

/** Dodaje priloge uz zapis (u jednoj transakciji; neispravna datoteka → ništa se ne sprema). */
export async function dodajPriloge(
  db: PrismaClient,
  akter: Akter,
  entitet: string,
  entitetId: string,
  datoteke: readonly Datoteka[],
): Promise<number> {
  const vlasnik = Object.hasOwn(VLASNICI, entitet) ? VLASNICI[entitet] : undefined;
  if (!vlasnik || !jeUuid(entitetId)) throw new GreskaKorisniku("Zapis ne postoji.");
  if (datoteke.length === 0) throw new GreskaKorisniku("Odaberite datoteku.");
  const provjerene = datoteke.map((d) => {
    const r = provjeriPrilog(d.naziv, d.velicina);
    if (!r.ok) throw new GreskaKorisniku(r.greska);
    if (d.sadrzaj.byteLength !== d.velicina) throw new GreskaKorisniku(`Datoteka „${r.naziv}“ nije potpuno poslana.`);
    return { ...d, naziv: r.naziv, vrsta: r.vrsta };
  });
  return db.$transaction(async (tx) => {
    const opis = await vlasnik(tx, akter.firmaId, entitetId);
    if (!opis) throw new GreskaKorisniku("Zapis ne postoji.");
    const postoji = await tx.prilog.count({ where: { firmaId: akter.firmaId, entitet, entitetId } });
    if (postoji + provjerene.length > NAJVISE_PRILOGA) throw new GreskaKorisniku(`Najviše ${NAJVISE_PRILOGA} priloga po zapisu.`);
    const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    for (const d of provjerene) {
      const p = await tx.prilog.create({
        data: {
          firmaId: akter.firmaId,
          entitet,
          entitetId,
          naziv: d.naziv,
          vrsta: d.vrsta,
          velicina: d.velicina,
          sadrzaj: d.sadrzaj as Uint8Array<ArrayBuffer>,
          korisnikId: akter.korisnikId,
          korisnik: ime,
        },
        select: { id: true },
      });
      await zapisiDnevnik(tx, {
        firmaId: akter.firmaId,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "prilozi.dodaj",
        entitet,
        entitetId,
        opis: `Prilog „${d.naziv}“ dodan (${opis})`,
        novo: { prilog: d.naziv, prilogId: p.id },
      });
    }
    return provjerene.length;
  });
}

export async function obrisiPrilog(db: PrismaClient, akter: Akter, entitet: string, prilogId: string): Promise<void> {
  if (!jeUuid(prilogId)) throw new GreskaKorisniku("Prilog ne postoji.");
  await db.$transaction(async (tx) => {
    const p = await tx.prilog.findFirst({ where: { id: prilogId, firmaId: akter.firmaId, entitet }, select: { naziv: true, entitetId: true } });
    if (!p) throw new GreskaKorisniku("Prilog ne postoji.");
    await tx.prilog.delete({ where: { id: prilogId } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "prilozi.obrisi",
      entitet,
      entitetId: p.entitetId,
      opis: `Prilog „${p.naziv}“ obrisan (${NAZIVI_ENTITETA[entitet] ?? entitet})`,
      staro: { prilog: p.naziv, prilogId },
    });
  });
}
