import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { danas, datum as uDatum, jeDatum, usporedi as usporediDatume } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { opisSkeniranog, usporedi, type UredajUProgramu } from "@/domain/inventura";
import { normalizirajSerijski, provjeriSerijski, type Stanje } from "@/domain/stanja-uredaja";
import { oznakaDokumenta } from "@/domain/zaprimanje";
import { GreskaKorisniku } from "@/lib/greske";
import { sljedeciBroj } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

type Tx = Prisma.TransactionClient;

const ODABIR_UREDAJA = { id: true, serijski: true, stanje: true, skladisteId: true, skladiste: { select: { naziv: true } } } as const;
const uProgramu = (u: {
  id: string;
  serijski: string;
  stanje: string;
  skladisteId: string | null;
  skladiste: { naziv: string } | null;
}): UredajUProgramu => ({
  id: u.id,
  serijski: u.serijski,
  stanje: u.stanje as Stanje,
  skladisteId: u.skladisteId,
  skladiste: u.skladiste?.naziv ?? null,
});

async function ime(tx: Tx, id: string) {
  return (await tx.korisnik.findUnique({ where: { id }, select: { ime: true } }))?.ime ?? "Nepoznat";
}

/** Nova inventura skladišta — najviše jedna otvorena po skladištu. */
export async function otvoriInventuru(
  db: PrismaClient,
  akter: Akter,
  ulaz: { skladisteId: string; datum: string; napomena: string | null },
  sada = new Date(),
) {
  if (!jeUuid(ulaz.skladisteId)) throw new GreskaKorisniku("Odaberite skladište.");
  if (!jeDatum(ulaz.datum)) throw new GreskaKorisniku("Datum nije ispravan.");
  const datum = uDatum(ulaz.datum);
  if (usporediDatume(datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum ne smije biti u budućnosti.");
  return db.$transaction(async (tx) => {
    const f = akter.firmaId;
    await tx.$queryRaw`SELECT id FROM "Skladiste" WHERE id = ${ulaz.skladisteId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const s = await tx.skladiste.findFirst({ where: { id: ulaz.skladisteId, firmaId: f } });
    if (!s) throw new GreskaKorisniku("Odaberite skladište.");
    const otvorena = await tx.inventura.findFirst({ where: { firmaId: f, skladisteId: s.id, status: "OTVORENA" }, select: { broj: true } });
    if (otvorena) throw new GreskaKorisniku(`Za skladište ${s.naziv} već je otvorena inventura ${otvorena.broj}.`);
    const godina = Number(datum.slice(0, 4));
    const redni = await sljedeciBroj(tx, f, "inventura", godina);
    const broj = oznakaDokumenta("INV", redni, godina);
    const inv = await tx.inventura.create({
      data: {
        firmaId: f,
        broj,
        godina,
        redni,
        datum: new Date(`${datum}T00:00:00Z`),
        skladisteId: s.id,
        napomena: ulaz.napomena,
        korisnikId: akter.korisnikId,
        korisnik: await ime(tx, akter.korisnikId),
      },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "inventure.otvori",
      entitet: "Inventura",
      entitetId: inv.id,
      opis: `Otvorena inventura ${broj} (${s.naziv})`,
    });
    return { id: inv.id, broj };
  });
}

async function otvorena(tx: Tx, firmaId: string, id: string) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Inventura ne postoji.");
  await tx.$queryRaw`SELECT id FROM "Inventura" WHERE id = ${id}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
  const inv = await tx.inventura.findFirst({ where: { id, firmaId } });
  if (!inv) throw new GreskaKorisniku("Inventura ne postoji.");
  if (inv.status !== "OTVORENA") throw new GreskaKorisniku(`Inventura ${inv.broj} je zaključena.`);
  return inv;
}

export type Skenirano = { serijski: string; opis: string; rezultat: string; puta: number };

/** Skenirani serijski brojevi (ponovljeni se broje). Vraća opis za svaki — skladištar odmah vidi višak. */
export async function skenirajUInventuru(db: PrismaClient, akter: Akter, id: string, upis: readonly string[]): Promise<Skenirano[]> {
  const serijski = [...new Set(upis.map(normalizirajSerijski))].slice(0, 5000);
  for (const s of serijski) {
    const r = provjeriSerijski(s);
    if (!r.ok) throw new GreskaKorisniku(r.greska);
  }
  if (serijski.length === 0) return [];
  return db.$transaction(async (tx) => {
    const inv = await otvorena(tx, akter.firmaId, id);
    const uredaji = await tx.uredaj.findMany({ where: { firmaId: akter.firmaId, serijski: { in: serijski } }, select: ODABIR_UREDAJA });
    const poSerijskom = new Map(uredaji.map((u) => [u.serijski, uProgramu(u)]));
    await tx.$executeRaw`
      INSERT INTO "StavkaInventure" (id, "firmaId", "inventuraId", serijski, "uredajId", skenirano, vrijeme)
      SELECT gen_random_uuid(), ${akter.firmaId}::uuid, ${inv.id}::uuid, s, u.id, 1, now()
      FROM unnest(${serijski}::text[]) AS s
      LEFT JOIN "Uredaj" u ON u."firmaId" = ${akter.firmaId}::uuid AND u.serijski = s
      ON CONFLICT ("inventuraId", serijski) DO UPDATE SET skenirano = "StavkaInventure".skenirano + 1, vrijeme = now()`;
    const stavke = await tx.stavkaInventure.findMany({
      where: { inventuraId: inv.id, serijski: { in: serijski } },
      select: { serijski: true, skenirano: true },
    });
    const puta = new Map(stavke.map((s) => [s.serijski, s.skenirano]));
    return serijski.map((s) => {
      const o = opisSkeniranog(inv.skladisteId, poSerijskom.get(s) ?? null);
      return { serijski: s, opis: o.opis, rezultat: o.rezultat, puta: puta.get(s) ?? 1 };
    });
  });
}

export async function ukloniIzInventure(db: PrismaClient, akter: Akter, id: string, serijski: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const inv = await otvorena(tx, akter.firmaId, id);
    await tx.stavkaInventure.deleteMany({ where: { firmaId: akter.firmaId, inventuraId: inv.id, serijski: normalizirajSerijski(serijski) } });
  });
}

/**
 * Zaključenje: usporedba sa stanjem u programu U TRENUTKU zaključenja (uređaji skladišta zaključani dok traje).
 * Rezultat se sprema; uređaji se ne mijenjaju.
 */
export async function zakljuciInventuru(db: PrismaClient, akter: Akter, id: string) {
  return db.$transaction(
    async (tx) => {
      const f = akter.firmaId;
      const inv = await otvorena(tx, f, id);
      await tx.$queryRaw`SELECT id FROM "Uredaj" WHERE "firmaId" = ${f}::uuid AND "skladisteId" = ${inv.skladisteId}::uuid ORDER BY id FOR SHARE`;
      const ocekivani = (await tx.uredaj.findMany({ where: { firmaId: f, skladisteId: inv.skladisteId }, select: ODABIR_UREDAJA })).map(uProgramu);
      const stavke = await tx.stavkaInventure.findMany({ where: { inventuraId: inv.id }, select: { serijski: true } });
      const skeniraniUredaji = await tx.uredaj.findMany({
        where: { firmaId: f, serijski: { in: stavke.map((s) => s.serijski) } },
        select: ODABIR_UREDAJA,
      });
      const mapa = new Map(skeniraniUredaji.map((u) => [u.serijski, uProgramu(u)]));
      const r = usporedi(
        inv.skladisteId,
        ocekivani,
        stavke.map((s) => ({ serijski: s.serijski, uredaj: mapa.get(s.serijski) ?? null })),
      );
      const skeniraniSet = new Set(stavke.map((s) => s.serijski));
      for (const s of r.stavke) {
        if (skeniraniSet.has(s.serijski)) {
          await tx.stavkaInventure.update({
            where: { inventuraId_serijski: { inventuraId: inv.id, serijski: s.serijski } },
            data: { rezultat: s.rezultat, uredajId: s.uredajId, stanje: s.stanje, skladiste: s.skladiste },
          });
        }
      }
      const manjak = r.stavke.filter((s) => s.rezultat === "MANJAK");
      if (manjak.length) {
        await tx.stavkaInventure.createMany({
          data: manjak.map((s) => ({
            firmaId: f,
            inventuraId: inv.id,
            serijski: s.serijski,
            uredajId: s.uredajId,
            rezultat: "MANJAK",
            stanje: s.stanje,
            skladiste: s.skladiste,
            skenirano: 0,
          })),
        });
      }
      await tx.inventura.update({
        where: { id: inv.id },
        data: { status: "ZAKLJUCENA", zakljuceno: new Date(), ocekivano: r.ocekivano, pronadjeno: r.pronadjeno, manjak: r.manjak, visak: r.visak },
      });
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "inventure.zakljuci",
        entitet: "Inventura",
        entitetId: inv.id,
        opis: `Zaključena inventura ${inv.broj}: očekivano ${r.ocekivano}, pronađeno ${r.pronadjeno}, manjak ${r.manjak}, višak ${r.visak}`,
      });
      return { ocekivano: r.ocekivano, pronadjeno: r.pronadjeno, manjak: r.manjak, visak: r.visak };
    },
    { timeout: 120_000 },
  );
}
