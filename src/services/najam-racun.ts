import type { Prisma } from "@/generated/prisma/client";
import { mjesecOd } from "@/domain/najam";
import { centiUDecimal } from "@/domain/novac";
import { brojUgovora } from "@/domain/ugovor-najma";
import { GreskaKorisniku } from "@/lib/greske";
import { sljedeciBroj } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { promijeniStanje } from "./uredaji";

type Tx = Prisma.TransactionClient;
const d = (x: string) => new Date(`${x}T00:00:00Z`);

/**
 * Račun iz prodaje sa stavkama najma uređaja (korak 3.8): uređaji idu na postojeći ili novi ugovor,
 * a stavka je rata za mjesec datuma računa — zapisana uz račun (ista rata ne može se naplatiti dvaput).
 * Poziva se u transakciji izdavanja računa (services/prodaja.ts).
 */
export async function najamSRacuna(
  tx: Tx,
  akter: Akter,
  p: {
    dokumentId: string;
    broj: string;
    datum: string;
    partnerId: string | null;
    poslovnicaId: string | null;
    ugovorNajmaId: string | null;
    nacinPlacanja: string;
    /** grupirane stavke najma s uređajima: ukupni iznos stavke (centi) dijeli se na uređaje; cijena = jedinična bez popusta */
    stavke: { uredajIds: string[]; iznos: number; cijena: number }[];
  },
): Promise<string | null> {
  const stavke = p.stavke.filter((s) => s.uredajIds.length);
  if (!stavke.length) return null;
  const f = akter.firmaId;
  if (!p.partnerId) throw new GreskaKorisniku("Za najam uređaja odaberite kupca.");
  const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";

  // ugovor: odabrani (isti kupac, traje na datum računa) ili novi od datuma računa
  let ugovor: { id: string; broj: string };
  if (p.ugovorNajmaId) {
    await tx.$queryRaw`SELECT id FROM "UgovorNajma" WHERE id = ${p.ugovorNajmaId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const u = await tx.ugovorNajma.findFirst({ where: { id: p.ugovorNajmaId, firmaId: f } });
    if (!u || u.partnerId !== p.partnerId) throw new GreskaKorisniku("Odabrani ugovor o najmu nije ovog kupca.");
    const kraj = [u.do, u.otkazan].filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime())[0];
    if (u.od > d(p.datum) || (kraj && kraj < d(p.datum))) throw new GreskaKorisniku(`Ugovor ${u.broj} ne traje na datum računa.`);
    ugovor = u;
  } else {
    const godina = Number(p.datum.slice(0, 4));
    let broj: string;
    let redni: number;
    do {
      redni = await sljedeciBroj(tx, f, "ugovorNajma", godina);
      broj = brojUgovora(redni, godina);
    } while (await tx.ugovorNajma.count({ where: { firmaId: f, broj } }));
    ugovor = await tx.ugovorNajma.create({
      data: {
        firmaId: f,
        broj,
        redni,
        godina,
        partnerId: p.partnerId,
        poslovnicaId: p.poslovnicaId,
        od: d(p.datum),
        nacinPlacanja: p.nacinPlacanja,
        uvjeti: `Otvoren računom ${p.broj}.`,
        izvorDokumentId: p.dokumentId,
        korisnikId: akter.korisnikId,
        korisnik: ime,
      },
      select: { id: true, broj: true },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.ugovor",
      entitet: "UgovorNajma",
      entitetId: ugovor.id,
      opis: `Novi ugovor o najmu ${broj} iz računa ${p.broj}`,
    });
  }

  const mjesec = mjesecOd(p.datum);
  const mjesecDatum = d(`${mjesec}-01`);
  const svi = stavke.flatMap((s) => s.uredajIds);
  const uredaji = new Map(
    (await tx.uredaj.findMany({ where: { firmaId: f, id: { in: svi } }, select: { id: true, serijski: true, stanje: true, partnerId: true } })).map(
      (u) => [u.id, u],
    ),
  );
  // uređaji koji još nisu na ugovoru na taj datum: sa skladišta u najam ili (već kod kupca) preuzimaju se na ugovor
  const planovi = await tx.uredajNaUgovoru.findMany({
    where: { firmaId: f, ugovorId: ugovor.id, uredajId: { in: svi }, od: { lte: d(p.datum) }, OR: [{ do: null }, { do: { gte: d(p.datum) } }] },
    select: { id: true, uredajId: true },
  });
  const planUredaja = new Map(planovi.map((x) => [x.uredajId, x.id]));
  const noviSaSkladista = svi.filter((id) => !planUredaja.has(id) && uredaji.get(id)?.stanje !== "U_NAJMU" && uredaji.get(id)?.stanje !== "PRODAN");
  const noviKodKupca = svi.filter((id) => !planUredaja.has(id) && !noviSaSkladista.includes(id));
  const tudji = noviKodKupca.filter((id) => uredaji.get(id)?.partnerId !== p.partnerId);
  if (tudji.length) throw new GreskaKorisniku(`Uređaji nisu kod ovog kupca: ${tudji.map((id) => uredaji.get(id)?.serijski).join(", ")}`);
  const dokument = { vrsta: "Ugovor o najmu", id: ugovor.id, broj: ugovor.broj };
  await promijeniStanje(tx, { firmaId: f, korisnikId: akter.korisnikId }, noviSaSkladista, "najam", {
    partnerId: p.partnerId,
    poslovnicaId: p.poslovnicaId,
    dokument,
  });
  await promijeniStanje(tx, { firmaId: f, korisnikId: akter.korisnikId }, noviKodKupca, "najamKodKlijenta", {
    partnerId: p.partnerId,
    poslovnicaId: p.poslovnicaId,
    dokument,
  });
  const novi = [...noviSaSkladista, ...noviKodKupca];
  if (novi.length) {
    const drugi = await tx.uredajNaUgovoru.findMany({
      where: { firmaId: f, uredajId: { in: novi }, OR: [{ do: null }, { do: { gte: d(p.datum) } }] },
      select: { uredaj: { select: { serijski: true } }, ugovor: { select: { broj: true } } },
    });
    if (drugi.length) throw new GreskaKorisniku(`Već na ugovoru: ${drugi.map((x) => `${x.uredaj.serijski} (${x.ugovor.broj})`).join(", ")}`);
  }

  for (const s of stavke) {
    // iznos stavke po uređaju (ostatak zaokruživanja ide prvom uređaju)
    const n = s.uredajIds.length;
    const po = Math.trunc(s.iznos / n);
    for (const [i, uredajId] of s.uredajIds.entries()) {
      const iznos = po + (i === 0 ? s.iznos - po * n : 0);
      let planId = planUredaja.get(uredajId);
      if (!planId) {
        planId = (
          await tx.uredajNaUgovoru.create({
            data: {
              firmaId: f,
              ugovorId: ugovor.id,
              uredajId,
              od: d(p.datum),
              izvor: noviKodKupca.includes(uredajId) ? "KLIJENT" : "SKLADISTE",
              dokumentId: p.dokumentId,
              korisnikId: akter.korisnikId,
              korisnik: ime,
            },
            select: { id: true },
          })
        ).id;
        // mjesečna cijena = jedinična cijena stavke (popust vrijedi samo za ovaj račun);
        // mjesec računa je naplaćen cijelim iznosom stavke (ručni iznos) — bez lažnog viška zbog početka usred mjeseca
        await tx.cijenaNajma.create({ data: { firmaId: f, planId, od: mjesecDatum, iznos: centiUDecimal(s.cijena) } });
        await tx.mjesecNajma.create({ data: { firmaId: f, planId, mjesec: mjesecDatum, iznos: centiUDecimal(iznos) } });
        planUredaja.set(uredajId, planId);
      }
      const vec = await tx.rataNajma.findUnique({
        where: { firmaId_planId_mjesec: { firmaId: f, planId, mjesec: mjesecDatum } },
        select: { dokumentId: true },
      });
      if (vec) {
        const r = vec.dokumentId ? await tx.prodajniDokument.findFirst({ where: { id: vec.dokumentId, firmaId: f }, select: { broj: true } }) : null;
        throw new GreskaKorisniku(
          `Najam uređaja ${uredaji.get(uredajId)?.serijski} za ${mjesec.slice(5)}/${mjesec.slice(0, 4)} je već naplaćen${r?.broj ? ` (račun ${r.broj})` : " (izvan programa)"}.`,
        );
      }
      await tx.rataNajma.create({
        data: {
          firmaId: f,
          planId,
          mjesec: mjesecDatum,
          iznos: centiUDecimal(iznos),
          dokumentId: p.dokumentId,
          korisnikId: akter.korisnikId,
          korisnik: ime,
        },
      });
    }
  }
  return ugovor.id;
}

/** Nacrt računa s najmom: odabir postojećeg ugovora kupca (null = pri izdavanju otvara se novi). */
export async function postaviUgovorNacrta(
  db: import("@/generated/prisma/client").PrismaClient,
  akter: Akter,
  dokumentId: string,
  ugovorId: string | null,
) {
  const f = akter.firmaId;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProdajniDokument" WHERE id = ${dokumentId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const dok = await tx.prodajniDokument.findFirst({
      where: { id: dokumentId, firmaId: f },
      select: { status: true, vrsta: true, partnerId: true },
    });
    if (!dok || dok.vrsta !== "RACUN" || dok.status !== "NACRT") throw new GreskaKorisniku("Ugovor se bira samo na nacrtu računa.");
    if (ugovorId) {
      const u = await tx.ugovorNajma.findFirst({ where: { id: ugovorId, firmaId: f }, select: { partnerId: true } });
      if (!u || u.partnerId !== dok.partnerId) throw new GreskaKorisniku("Odabrani ugovor o najmu nije ovog kupca.");
    }
    await tx.prodajniDokument.update({ where: { id: dokumentId }, data: { ugovorNajmaId: ugovorId, verzija: { increment: 1 } } });
  });
}

/**
 * Storno računa s ratama najma (u transakciji storna): rate se oslobađaju; uređaji koje je taj račun stavio na ugovor
 * vraćaju se na skladište, a ugovor otvoren tim računom briše se ako je ostao prazan.
 * Ugovoru s automatskim izdavanjem ono se isključuje (inače bi iste rate odmah opet izdao).
 */
export async function ponistiNajamRacuna(tx: Tx, akter: Akter, racun: { id: string; broj: string | null }, skladisteId: string): Promise<void> {
  const f = akter.firmaId;
  const rate = await tx.rataNajma.findMany({ where: { firmaId: f, dokumentId: racun.id }, select: { plan: { select: { ugovorId: true } } } });
  const ugovori = [...new Set(rate.map((r) => r.plan.ugovorId))];
  await tx.rataNajma.deleteMany({ where: { firmaId: f, dokumentId: racun.id } });
  const planovi = await tx.uredajNaUgovoru.findMany({
    where: { firmaId: f, dokumentId: racun.id },
    include: { uredaj: { select: { id: true, serijski: true, stanje: true } }, ugovor: { select: { id: true, broj: true } } },
  });
  for (const p of planovi) {
    if (await tx.rataNajma.count({ where: { firmaId: f, planId: p.id } }))
      throw new GreskaKorisniku(
        `Najam uređaja ${p.uredaj.serijski} je nakon ovog računa dalje naplaćivan — prvo stornirajte kasnije račune ili vratite uređaj s ugovora.`,
      );
    await tx.uredajNaUgovoru.delete({ where: { id: p.id } });
    if (p.uredaj.stanje === "U_NAJMU")
      await promijeniStanje(tx, { firmaId: f, korisnikId: akter.korisnikId }, [p.uredaj.id], "povratIzNajma", {
        skladisteId,
        dokument: { vrsta: "Storno računa", id: racun.id, broj: racun.broj },
        opis: `Storno računa ${racun.broj}: uređaj skinut s ugovora ${p.ugovor.broj}`,
      });
  }
  const otvoreni = await tx.ugovorNajma.findMany({ where: { firmaId: f, izvorDokumentId: racun.id }, select: { id: true, broj: true } });
  for (const u of otvoreni) {
    if (await tx.uredajNaUgovoru.count({ where: { firmaId: f, ugovorId: u.id } })) continue;
    await tx.prilog.deleteMany({ where: { firmaId: f, entitet: "UgovorNajma", entitetId: u.id } });
    await tx.ugovorNajma.delete({ where: { id: u.id } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "najam.ugovor",
      entitet: "UgovorNajma",
      entitetId: u.id,
      opis: `Ugovor ${u.broj} obrisan — storniran račun ${racun.broj} kojim je otvoren`,
    });
  }
  await tx.ugovorNajma.updateMany({
    where: { firmaId: f, id: { in: ugovori }, automatski: true },
    data: { automatski: false, automatskiGreska: `Isključeno jer je storniran račun ${racun.broj} — provjerite rate i ponovno uključite.` },
  });
}
