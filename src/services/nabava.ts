import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { danas, jeDatum, usporedi } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { pdvRezimNabave, provjeriZaprimanje, statusNarudzbe } from "@/domain/nabava";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import { pdvStatus } from "@/domain/partner";
import { imaPosebno } from "@/domain/prava";
import { oznakaDokumenta } from "@/domain/zaprimanje";
import { GreskaKorisniku } from "@/lib/greske";
import { sljedeciBroj } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { zaprimi } from "./primke";

type Tx = Prisma.TransactionClient;
const d = (x: string) => new Date(`${x}T00:00:00Z`);

export type UlazNarudzbenice = {
  datum: string;
  dobavljacId: string;
  napomena: string | null;
  /** cijena u centima bez PDV-a; bez prava na nabavne cijene se ne može upisati (0) */
  stavke: { modelId: string; kolicina: number; cijena: number }[];
  verzija: number;
};

async function zakljucaj(tx: Tx, firmaId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "Narudzbenica" WHERE id = ${id}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
  const n = await tx.narudzbenica.findFirst({ where: { id, firmaId }, include: { stavke: { orderBy: { redoslijed: "asc" } } } });
  if (!n) throw new GreskaKorisniku("Narudžbenica ne postoji.");
  return n;
}

/** Nova narudžbenica ili izmjena dok ništa nije zaprimljeno. PDV režim prema državi i statusu dobavljača. */
export async function spremiNarudzbenicu(
  db: PrismaClient,
  akter: Akter,
  id: string | null,
  u: UlazNarudzbenice,
): Promise<{ id: string; broj: string }> {
  if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Narudžbenica ne postoji.");
  if (!jeDatum(u.datum)) throw new GreskaKorisniku("Datum nije ispravan.");
  if (!jeUuid(u.dobavljacId)) throw new GreskaKorisniku("Odaberite dobavljača.");
  if (!u.stavke.length) throw new GreskaKorisniku("Dodajte barem jednu stavku.");
  if (u.stavke.length > 500) throw new GreskaKorisniku("Najviše 500 stavki.");
  const vidiCijene = imaPosebno(akter.prava, "costs");
  for (const [i, s] of u.stavke.entries()) {
    if (!jeUuid(s.modelId)) throw new GreskaKorisniku(`Stavka ${i + 1}: odaberite model.`);
    if (!Number.isInteger(s.kolicina) || s.kolicina < 1 || s.kolicina > 100_000)
      throw new GreskaKorisniku(`Stavka ${i + 1}: količina mora biti 1 ili više.`);
    if (!Number.isSafeInteger(s.cijena) || s.cijena < 0) throw new GreskaKorisniku(`Stavka ${i + 1}: cijena nije ispravna.`);
  }
  const f = akter.firmaId;
  return db.$transaction(async (tx) => {
    const dob = await tx.partner.findFirst({ where: { id: u.dobavljacId, firmaId: f } });
    if (!dob?.aktivan || !dob.dobavljac) throw new GreskaKorisniku("Odaberite aktivnog dobavljača.");
    const modeli = [...new Set(u.stavke.map((s) => s.modelId))];
    if ((await tx.modelUredaja.count({ where: { firmaId: f, id: { in: modeli }, aktivan: true } })) !== modeli.length)
      throw new GreskaKorisniku("Neki modeli ne postoje ili su deaktivirani.");
    let stare: Map<string, number> = new Map();
    let narId: string;
    let broj: string;
    const pdvRezim = pdvRezimNabave(pdvStatus(dob.drzava, dob.pdvBroj, dob.pdvStatus));
    if (id) {
      const n = await zakljucaj(tx, f, id);
      if (n.verzija !== u.verzija) throw new GreskaKorisniku("Netko je u međuvremenu promijenio narudžbenicu. Osvježite stranicu.");
      if (n.stavke.some((s) => s.zaprimljeno > 0) || n.status !== "OTVORENA")
        throw new GreskaKorisniku("Po narudžbenici je već zaprimano — više se ne mijenja.");
      // bez prava na nabavne cijene: cijene ostaju kakve su bile (po modelu)
      stare = new Map(n.stavke.map((s) => [s.modelId, centiIzDecimala(s.cijena.toFixed(2))]));
      await tx.stavkaNarudzbenice.deleteMany({ where: { firmaId: f, narudzbenicaId: id } });
      narId = id;
      broj = n.broj;
    } else {
      const godina = Number(u.datum.slice(0, 4));
      const redni = await sljedeciBroj(tx, f, "narudzbenica", godina);
      broj = oznakaDokumenta("NAR", redni, godina);
      const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
      narId = (
        await tx.narudzbenica.create({
          data: {
            firmaId: f,
            broj,
            godina,
            redni,
            datum: d(u.datum),
            dobavljacId: u.dobavljacId,
            pdvRezim,
            korisnikId: akter.korisnikId,
            korisnik: ime,
          },
          select: { id: true },
        })
      ).id;
    }
    const cijena = (s: UlazNarudzbenice["stavke"][number]) => (vidiCijene ? s.cijena : (stare.get(s.modelId) ?? 0));
    await tx.stavkaNarudzbenice.createMany({
      data: u.stavke.map((s, i) => ({
        firmaId: f,
        narudzbenicaId: narId,
        redoslijed: i,
        modelId: s.modelId,
        kolicina: s.kolicina,
        cijena: centiUDecimal(cijena(s)),
      })),
    });
    const osnovica = u.stavke.reduce((a, s) => a + cijena(s) * s.kolicina, 0);
    await tx.narudzbenica.update({
      where: { id: narId },
      data: {
        datum: d(u.datum),
        dobavljacId: u.dobavljacId,
        pdvRezim,
        napomena: u.napomena?.trim() || null,
        osnovica: centiUDecimal(osnovica),
        verzija: { increment: 1 },
      },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "nabava.narudzbenica",
      entitet: "Narudzbenica",
      entitetId: narId,
      opis: `${id ? "Izmijenjena" : "Nova"} narudžbenica ${broj} — ${dob.naziv}, ${u.stavke.reduce((a, s) => a + s.kolicina, 0)} kom`,
    });
    return { id: narId, broj };
  });
}

/**
 * Zaprimanje po narudžbenici: primka sa serijskim brojevima po stavkama, nabavna cijena sa stavke.
 * Narudžbenica je zaključana — dvije istovremene primke ne mogu zaprimiti više od naručenog.
 */
export async function zaprimiPoNarudzbenici(
  db: PrismaClient,
  akter: Akter,
  narudzbenicaId: string,
  u: {
    datum: string;
    skladisteId: string;
    dokumentDobavljaca: string | null;
    knjiziUTroskove: boolean;
    stavke: { stavkaId: string; serijski: string[] }[];
  },
  sada = new Date(),
): Promise<{ id: string; broj: string }> {
  if (!jeUuid(narudzbenicaId)) throw new GreskaKorisniku("Narudžbenica ne postoji.");
  if (!jeDatum(u.datum) || usporedi(u.datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum primke nije ispravan.");
  const f = akter.firmaId;
  return db.$transaction(
    async (tx) => {
      const n = await zakljucaj(tx, f, narudzbenicaId);
      if (n.status === "ZATVORENA" || n.status === "STORNIRANA") throw new GreskaKorisniku("Narudžbenica je zatvorena.");
      const kolicine = new Map(u.stavke.map((s) => [s.stavkaId, s.serijski.filter((x) => x.trim()).length]));
      const g = provjeriZaprimanje(n.stavke, kolicine);
      if (g) throw new GreskaKorisniku(g);
      const stavke = n.stavke;
      const primka = await zaprimi(
        tx,
        akter,
        {
          datum: u.datum,
          skladisteId: u.skladisteId,
          dobavljacId: n.dobavljacId,
          stanjeRobeId: null,
          dokumentDobavljaca: u.dokumentDobavljaca,
          napomena: `Po narudžbenici ${n.broj}`,
          knjiziUTroskove: u.knjiziUTroskove,
          narudzbenicaId: n.id,
          stavke: u.stavke.flatMap((s) => {
            const st = stavke.find((x) => x.id === s.stavkaId)!;
            return s.serijski
              .filter((x) => x.trim())
              .map((serijski) => ({
                serijski,
                modelId: st.modelId,
                nabavnaCijena: centiIzDecimala(st.cijena.toFixed(2)),
                stavkaNarudzbeniceId: st.id,
              }));
          }),
        },
        sada,
      );
      for (const [stavkaId, k] of kolicine)
        if (k) await tx.stavkaNarudzbenice.update({ where: { id: stavkaId }, data: { zaprimljeno: { increment: k } } });
      const nove = await tx.stavkaNarudzbenice.findMany({
        where: { firmaId: f, narudzbenicaId: n.id },
        select: { kolicina: true, zaprimljeno: true },
      });
      await tx.narudzbenica.update({ where: { id: n.id }, data: { status: statusNarudzbe(n.status, nove), verzija: { increment: 1 } } });
      return primka;
    },
    { timeout: 120_000 },
  );
}

/** Ručno zatvaranje (ostatak se neće isporučiti) ili storno narudžbenice bez aktivnih primki. */
export async function zatvoriNarudzbenicu(db: PrismaClient, akter: Akter, id: string, radnja: "ZATVORI" | "STORNO" | "OTVORI") {
  if (!jeUuid(id)) throw new GreskaKorisniku("Narudžbenica ne postoji.");
  const f = akter.firmaId;
  await db.$transaction(async (tx) => {
    const n = await zakljucaj(tx, f, id);
    if (n.status === "STORNIRANA") throw new GreskaKorisniku("Narudžbenica je stornirana.");
    let status: string;
    if (radnja === "STORNO") {
      if (await tx.primka.count({ where: { firmaId: f, narudzbenicaId: id, status: "IZDANA" } }))
        throw new GreskaKorisniku("Po narudžbenici postoje primke — prvo ih stornirajte ili narudžbenicu zatvorite.");
      status = "STORNIRANA";
    } else if (radnja === "ZATVORI") status = "ZATVORENA";
    else {
      if (n.status !== "ZATVORENA") throw new GreskaKorisniku("Narudžbenica nije zatvorena.");
      status = statusNarudzbe("OTVORENA", n.stavke);
    }
    await tx.narudzbenica.update({ where: { id }, data: { status, verzija: { increment: 1 } } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "nabava.status",
      entitet: "Narudzbenica",
      entitetId: id,
      opis: `Narudžbenica ${n.broj}: ${radnja === "STORNO" ? "stornirana" : radnja === "ZATVORI" ? "zatvorena" : "ponovno otvorena"}`,
      staro: { status: n.status },
      novo: { status },
    });
  });
}
