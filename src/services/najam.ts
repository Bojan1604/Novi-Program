import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import { brojUgovora, provjeriUgovor, type UnosUgovora } from "@/domain/ugovor-najma";
import { GreskaKorisniku } from "@/lib/greske";
import { sljedeciBroj } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

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
