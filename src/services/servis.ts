import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { danas, jeDatum, usporedi } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { mjesecOd, visak } from "@/domain/najam";
import { imaPravo } from "@/domain/prava";
import { provjeriPrilog } from "@/domain/prilozi";
import {
  ishodZavrsetka,
  jeOtvoren,
  OTVORENI_STATUSI,
  krajNaplateOriginala,
  provjeriBrisanje,
  provjeriStatus,
  sljedeciDan,
  STATUSI_SERVISA,
  uredajKlijenta,
  type StatusServisa,
  type Zavrsetak,
} from "@/domain/servis";
import { normalizirajSerijski, type Stanje } from "@/domain/stanja-uredaja";
import { oznakaDokumenta } from "@/domain/zaprimanje";
import { GreskaKorisniku } from "@/lib/greske";
import { sljedeciBroj } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { podaciZaNaplatu } from "./najam";
import type { Datoteka } from "./prilozi";
import { promijeniStanje } from "./uredaji";

type Tx = Prisma.TransactionClient;
const d = (x: string) => new Date(`${x}T00:00:00Z`);
const dan = (x: Date) => x.toISOString().slice(0, 10);
const hr = (x: string) => `${x.split("-").reverse().join(".")}.`;

/** Tko radi: korisnik programa ili klijent s portala (korisnikId null, ime klijenta). */
export type IzvrsiteljServisa = { firmaId: string; korisnikId: string | null; ip?: string | null | undefined; ime?: string };

async function imeIzvrsitelja(tx: Tx, a: IzvrsiteljServisa): Promise<string> {
  if (a.ime) return a.ime;
  if (!a.korisnikId) return "Sustav";
  return (await tx.korisnik.findUnique({ where: { id: a.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
}

async function zakljucajNalog(tx: Tx, firmaId: string, id: string) {
  if (!jeUuid(id)) throw new GreskaKorisniku("Servisni nalog ne postoji.");
  await tx.$queryRaw`SELECT id FROM "ServisniNalog" WHERE id = ${id}::uuid AND "firmaId" = ${firmaId}::uuid FOR UPDATE`;
  const n = await tx.servisniNalog.findFirst({
    where: { id, firmaId },
    include: { uredaj: { select: { id: true, serijski: true, stanje: true } }, zamjenski: { select: { id: true, serijski: true } } },
  });
  if (!n) throw new GreskaKorisniku("Servisni nalog ne postoji.");
  return n;
}

const dokument = (n: { id: string; broj: string }) => ({ vrsta: "Servisni nalog", id: n.id, broj: n.broj });

async function dogadaj(tx: Tx, a: IzvrsiteljServisa, nalogId: string, opis: string, o: { status?: string | null; javno?: boolean } = {}) {
  await tx.dogadajServisa.create({
    data: {
      firmaId: a.firmaId,
      nalogId,
      opis,
      status: o.status ?? null,
      javno: o.javno ?? true,
      korisnikId: a.korisnikId,
      korisnik: await imeIzvrsitelja(tx, a),
    },
  });
}

export type UlazPrijema = {
  serijski: string;
  opisKvara: string;
  datum: string;
  /** gdje je uređaj za vrijeme servisa (neobavezno za uređaj kod klijenta) */
  skladisteId: string | null;
  kontakt: string | null;
};

/**
 * Prijem uređaja na servis: nalog s brojem, uređaj „na servisu“ (pamti stanje prije), veza na kupca i ugovor o najmu.
 * Uređaj ne može biti na dva otvorena naloga (prijelaz „prijem na servis“ ne dopušta uređaj koji je već na servisu).
 */
export async function zaprimiNaServis(
  db: PrismaClient | Tx,
  a: IzvrsiteljServisa,
  u: UlazPrijema,
  o: { izvor?: "PROGRAM" | "PORTAL"; partnerId?: string; sada?: Date } = {},
): Promise<{ id: string; broj: string }> {
  const serijski = normalizirajSerijski(u.serijski);
  const opis = u.opisKvara.trim();
  if (!serijski) throw new GreskaKorisniku("Upišite serijski broj uređaja.");
  if (opis.length < 3) throw new GreskaKorisniku("Opišite kvar.");
  if (opis.length > 2000) throw new GreskaKorisniku("Opis kvara je predug (najviše 2000 znakova).");
  if (!jeDatum(u.datum) || usporedi(u.datum, danas(o.sada ?? new Date())) > 0) throw new GreskaKorisniku("Datum prijema nije ispravan.");
  if (u.skladisteId !== null && !jeUuid(u.skladisteId)) throw new GreskaKorisniku("Odaberite skladište.");
  const f = a.firmaId;
  const posao = async (tx: Tx) => {
    const [r] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM "Uredaj" WHERE "firmaId" = ${f}::uuid AND serijski = ${serijski} FOR UPDATE`;
    if (!r) throw new GreskaKorisniku(`Uređaj ${serijski} nije u programu.`);
    const ur = await tx.uredaj.findFirstOrThrow({ where: { id: r.id, firmaId: f }, select: { id: true, stanje: true, partnerId: true } });
    // portal: klijent smije prijaviti samo svoj uređaj
    if (o.partnerId !== undefined && ur.partnerId !== o.partnerId) throw new GreskaKorisniku(`Uređaj ${serijski} nije među vašim uređajima.`);
    if (u.skladisteId && !(await tx.skladiste.count({ where: { id: u.skladisteId, firmaId: f, aktivan: true } })))
      throw new GreskaKorisniku("Odaberite aktivno skladište.");
    const prijava = await tx.servisniNalog.findFirst({ where: { firmaId: f, uredajId: ur.id, status: "PRIJAVLJEN" }, select: { broj: true } });
    if (prijava) throw new GreskaKorisniku(`Za uređaj ${serijski} postoji prijava kvara ${prijava.broj} — zaprimite uređaj na njoj.`);
    const stanje = ur.stanje as Stanje;
    const plan =
      stanje === "U_NAJMU"
        ? await tx.uredajNaUgovoru.findFirst({
            where: { firmaId: f, uredajId: ur.id, od: { lte: d(u.datum) }, OR: [{ do: null }, { do: { gte: d(u.datum) } }] },
            select: { ugovorId: true },
          })
        : null;
    const godina = Number(u.datum.slice(0, 4));
    const redni = await sljedeciBroj(tx, f, "servis", godina);
    const broj = oznakaDokumenta("SRV", redni, godina);
    const n = await tx.servisniNalog.create({
      data: {
        firmaId: f,
        broj,
        godina,
        redni,
        datum: d(u.datum),
        uredajId: ur.id,
        partnerId: uredajKlijenta(stanje) ? ur.partnerId : null,
        ugovorNajmaId: plan?.ugovorId ?? null,
        stanjePrije: stanje,
        opisKvara: opis,
        kontakt: u.kontakt?.trim() || null,
        izvor: o.izvor ?? "PROGRAM",
        korisnikId: a.korisnikId,
        korisnik: await imeIzvrsitelja(tx, a),
      },
      select: { id: true, broj: true },
    });
    await promijeniStanje(tx, { firmaId: f, korisnikId: a.korisnikId }, [ur.id], "ulazNaServis", {
      ...(u.skladisteId ? { skladisteId: u.skladisteId } : {}),
      dokument: dokument(n),
      opis: `Prijem na servis: ${opis.slice(0, 200)}`,
    });
    await dogadaj(tx, a, n.id, `Zaprimljen: ${opis}`, { status: "ZAPRIMLJEN" });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "servis.zaprimi",
      entitet: "ServisniNalog",
      entitetId: n.id,
      opis: `Servisni nalog ${broj}: ${serijski}${o.izvor === "PORTAL" ? " (prijava s portala)" : ""}`,
    });
    return n;
  };
  return "$transaction" in db ? (db as PrismaClient).$transaction(posao, { timeout: 30_000 }) : posao(db);
}

/** Promjena statusa otvorenog naloga; poruka klijentu (neobavezna) vidi se na portalu. */
export async function promijeniStatusServisa(
  db: PrismaClient,
  a: Akter,
  id: string,
  u: { status: string; poruka: string | null; verzija: number },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const n = await zakljucajNalog(tx, a.firmaId, id);
    if (n.verzija !== u.verzija) throw new GreskaKorisniku("Netko je u međuvremenu promijenio nalog. Osvježite stranicu.");
    const g = provjeriStatus(n.status, u.status);
    if (g) throw new GreskaKorisniku(g);
    await tx.servisniNalog.update({ where: { id: n.id }, data: { status: u.status, verzija: { increment: 1 } } });
    const naziv = STATUSI_SERVISA[u.status as StatusServisa];
    await dogadaj(tx, a, n.id, u.poruka?.trim() ? `${naziv}: ${u.poruka.trim()}` : naziv, { status: u.status });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "servis.uredi",
      entitet: "ServisniNalog",
      entitetId: n.id,
      opis: `Servisni nalog ${n.broj}: ${naziv}`,
      staro: { status: n.status },
      novo: { status: u.status },
    });
  });
}

/** Interna dijagnoza (nikad na portalu) i napomena klijentu (javna). */
export async function spremiDijagnozu(
  db: PrismaClient,
  a: Akter,
  id: string,
  u: { dijagnoza: string | null; napomenaKlijentu: string | null; verzija: number },
): Promise<void> {
  const dijagnoza = u.dijagnoza?.trim() || null;
  const napomena = u.napomenaKlijentu?.trim() || null;
  if ((dijagnoza?.length ?? 0) > 5000 || (napomena?.length ?? 0) > 2000) throw new GreskaKorisniku("Tekst je predug.");
  await db.$transaction(async (tx) => {
    const n = await zakljucajNalog(tx, a.firmaId, id);
    if (n.verzija !== u.verzija) throw new GreskaKorisniku("Netko je u međuvremenu promijenio nalog. Osvježite stranicu.");
    await tx.servisniNalog.update({ where: { id: n.id }, data: { dijagnoza, napomenaKlijentu: napomena, verzija: { increment: 1 } } });
    if (napomena && napomena !== n.napomenaKlijentu) await dogadaj(tx, a, n.id, `Napomena: ${napomena}`);
    if (dijagnoza !== n.dijagnoza) await dogadaj(tx, a, n.id, "Dijagnoza izmijenjena", { javno: false });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "servis.uredi",
      entitet: "ServisniNalog",
      entitetId: n.id,
      opis: `Servisni nalog ${n.broj}: dijagnoza i napomena`,
      staro: { dijagnoza: n.dijagnoza, napomenaKlijentu: n.napomenaKlijentu },
      novo: { dijagnoza, napomenaKlijentu: napomena },
    });
  });
}

/** Zamjenski uređaj klijentu dok je njegov na servisu (besplatno: najam se i dalje naplaćuje samo za original). */
export async function izdajZamjenu(db: PrismaClient, a: Akter, id: string, u: { serijski: string; datum: string }, sada = new Date()) {
  const serijski = normalizirajSerijski(u.serijski);
  if (!serijski) throw new GreskaKorisniku("Upišite serijski broj zamjenskog uređaja.");
  if (!jeDatum(u.datum) || usporedi(u.datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum nije ispravan.");
  const f = a.firmaId;
  await db.$transaction(async (tx) => {
    const n = await zakljucajNalog(tx, f, id);
    if (!jeOtvoren(n.status)) throw new GreskaKorisniku("Nalog je zatvoren.");
    if (n.status === "PRIJAVLJEN") throw new GreskaKorisniku("Prvo zaprimite uređaj.");
    if (!n.partnerId || !uredajKlijenta(n.stanjePrije as Stanje))
      throw new GreskaKorisniku("Zamjenski uređaj se daje samo za uređaj kupca ili iz najma.");
    if (n.zamjenskiUredajId && !n.zamjenaDo) throw new GreskaKorisniku(`Klijent već ima zamjenski uređaj ${n.zamjenski?.serijski}.`);
    const z = await tx.uredaj.findFirst({ where: { firmaId: f, serijski }, select: { id: true } });
    if (!z) throw new GreskaKorisniku(`Uređaj ${serijski} nije u programu.`);
    if (z.id === n.uredajId) throw new GreskaKorisniku("Zamjenski uređaj ne može biti isti uređaj.");
    await promijeniStanje(tx, { firmaId: f, korisnikId: a.korisnikId }, [z.id], "izdavanjeZamjene", {
      partnerId: n.partnerId,
      dokument: dokument(n),
      opis: `Zamjena za ${n.uredaj.serijski}`,
    });
    await tx.servisniNalog.update({
      where: { id: n.id },
      data: { zamjenskiUredajId: z.id, zamjenaOd: d(u.datum), zamjenaDo: null, imaoZamjenu: true, verzija: { increment: 1 } },
    });
    await dogadaj(tx, a, n.id, `Izdan zamjenski uređaj ${serijski}`);
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "servis.zamjena",
      entitet: "ServisniNalog",
      entitetId: n.id,
      opis: `Servisni nalog ${n.broj}: zamjenski uređaj ${serijski}`,
    });
  });
}

async function povratZamjene(tx: Tx, a: Akter, n: Awaited<ReturnType<typeof zakljucajNalog>>, skladisteId: string | null, datum: string) {
  if (!n.zamjenskiUredajId || n.zamjenaDo) return;
  if (!skladisteId || !jeUuid(skladisteId)) throw new GreskaKorisniku("Odaberite skladište za vraćeni zamjenski uređaj.");
  if (!(await tx.skladiste.count({ where: { id: skladisteId, firmaId: a.firmaId, aktivan: true } })))
    throw new GreskaKorisniku("Odaberite aktivno skladište.");
  await promijeniStanje(tx, { firmaId: a.firmaId, korisnikId: a.korisnikId }, [n.zamjenskiUredajId], "povratZamjene", {
    skladisteId,
    dokument: dokument(n),
    opis: `Povrat zamjenskog uređaja (za ${n.uredaj.serijski})`,
  });
  await tx.servisniNalog.update({ where: { id: n.id }, data: { zamjenaDo: d(datum), verzija: { increment: 1 } } });
  await dogadaj(tx, a, n.id, `Vraćen zamjenski uređaj ${n.zamjenski?.serijski ?? ""}`.trim());
}

export async function vratiZamjenu(db: PrismaClient, a: Akter, id: string, u: { skladisteId: string; datum: string }, sada = new Date()) {
  if (!jeDatum(u.datum) || usporedi(u.datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum nije ispravan.");
  await db.$transaction(async (tx) => {
    const n = await zakljucajNalog(tx, a.firmaId, id);
    if (!n.zamjenskiUredajId || n.zamjenaDo) throw new GreskaKorisniku("Klijent nema zamjenski uređaj.");
    await povratZamjene(tx, a, n, u.skladisteId, u.datum);
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "servis.zamjena",
      entitet: "ServisniNalog",
      entitetId: n.id,
      opis: `Servisni nalog ${n.broj}: vraćen zamjenski uređaj ${n.zamjenski?.serijski ?? ""}`,
    });
  });
}

export type UlazZavrsetka = { ishod: Zavrsetak; datum: string; skladisteId: string | null; napomena: string | null };

/**
 * Završetak naloga (vraćen, otkazan, otpisan) — uređaj i zamjenski prema `ishodZavrsetka`, sve u jednoj transakciji.
 * Otpis uređaja iz najma: sa zamjenskim se najam prenosi na njega (original se naplaćuje do kraja već fakturiranog,
 * zamjenski od sljedećeg dana po istoj cijeni — nikad dvostruko); bez zamjenskog se naplata originala zatvara.
 */
export async function zavrsiNalog(db: PrismaClient, a: Akter, id: string, u: UlazZavrsetka, sada = new Date()): Promise<{ visak: number }> {
  if (!jeDatum(u.datum) || usporedi(u.datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum nije ispravan.");
  if (u.ishod === "OTPISAN" && !imaPravo(a.prava, "servis", "puno")) throw new GreskaKorisniku("Za otpis uređaja trebate puno pravo na servis.");
  if (u.skladisteId !== null && !jeUuid(u.skladisteId)) throw new GreskaKorisniku("Odaberite skladište.");
  const f = a.firmaId;
  return db.$transaction(
    async (tx) => {
      const n = await zakljucajNalog(tx, f, id);
      if (!jeOtvoren(n.status)) throw new GreskaKorisniku("Nalog je već zatvoren.");
      if (u.datum < dan(n.datum)) throw new GreskaKorisniku("Datum završetka ne može biti prije prijema.");
      const imaZamjenu = !!n.zamjenskiUredajId && !n.zamjenaDo;
      const i = ishodZavrsetka(u.ishod, n.stanjePrije as Stanje, imaZamjenu, n.status === "PRIJAVLJEN");
      if (!i.ok) throw new GreskaKorisniku(i.razlog);
      const izv = { firmaId: f, korisnikId: a.korisnikId };
      if (i.uredaj)
        await promijeniStanje(tx, izv, [n.uredajId], i.uredaj, {
          ...(u.skladisteId && (n.stanjePrije === "NA_SKLADISTU" || n.stanjePrije === "REZERVIRAN") ? { skladisteId: u.skladisteId } : {}),
          dokument: dokument(n),
          opis: `Servis: ${STATUSI_SERVISA[u.ishod].toLowerCase()}`,
        });
      // uređaj iz najma koji više nije ni na jednom ugovoru (plan završen dok je bio na servisu) ide na skladište
      if (i.uredaj === "izlazSaServisa" && n.stanjePrije === "U_NAJMU" && !(await aktivniPlan(tx, f, n.uredajId, u.datum))) {
        if (!u.skladisteId) throw new GreskaKorisniku("Uređaj više nije na ugovoru o najmu — odaberite skladište za povrat.");
        await promijeniStanje(tx, izv, [n.uredajId], "povratIzNajma", {
          skladisteId: u.skladisteId,
          dokument: dokument(n),
          opis: "Nakon servisa na skladište (najam je završen)",
        });
      }
      let visakNajma = 0;
      let opisNajma = "";
      let preneseno = false;
      if (i.najam && n.ugovorNajmaId) {
        await tx.$queryRaw`SELECT id FROM "UgovorNajma" WHERE id = ${n.ugovorNajmaId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
        const plan = await tx.uredajNaUgovoru.findFirst({
          where: { firmaId: f, ugovorId: n.ugovorNajmaId, uredajId: n.uredajId, OR: [{ do: null }, { do: { gte: d(u.datum) } }] },
          include: { cijene: { orderBy: { od: "asc" } }, rate: { select: { mjesec: true }, orderBy: { mjesec: "desc" }, take: 1 } },
        });
        if (plan) {
          const ug = await tx.ugovorNajma.findFirstOrThrow({
            where: { id: n.ugovorNajmaId, firmaId: f },
            select: { broj: true, do: true, otkazan: true },
          });
          if (i.najam === "PRENESI" && n.zamjenskiUredajId) {
            const zadnji = plan.rate[0] ? plan.rate[0].mjesec.toISOString().slice(0, 7) : null;
            const kraj = krajNaplateOriginala(u.datum < dan(plan.od) ? dan(plan.od) : u.datum, zadnji);
            await tx.uredajNaUgovoru.update({ where: { id: plan.id }, data: { do: d(kraj) } });
            const od = sljedeciDan(kraj);
            const krajUgovora = [ug.do, ug.otkazan]
              .filter((x): x is Date => !!x)
              .map(dan)
              .sort()[0];
            // zamjenski ostaje u najmu samo ako ugovor još traje (inače se vraća na skladište)
            if (!krajUgovora || od <= krajUgovora) {
              preneseno = true;
              await promijeniStanje(tx, izv, [n.zamjenskiUredajId], "zamjenaUNajam", {
                dokument: { vrsta: "Ugovor o najmu", id: n.ugovorNajmaId, broj: ug.broj },
                opis: `Zamjena za otpisani ${n.uredaj.serijski}`,
              });
              const novi = await tx.uredajNaUgovoru.create({
                data: {
                  firmaId: f,
                  ugovorId: n.ugovorNajmaId,
                  uredajId: n.zamjenskiUredajId,
                  od: d(od),
                  izvor: "KLIJENT",
                  napomena: `Zamjena za ${n.uredaj.serijski} (${n.broj})`,
                  korisnikId: a.korisnikId,
                  korisnik: await imeIzvrsitelja(tx, a),
                },
                select: { id: true },
              });
              // cijena koja vrijedi u prvom mjesecu zamjenskog i sve kasnije promjene (sezone)
              const m = mjesecOd(od);
              const cijene = plan.cijene.map((c) => ({ od: c.od.toISOString().slice(0, 7), iznos: c.iznos }));
              const vrijedi = cijene.filter((c) => c.od <= m).at(-1);
              const nove = [...(vrijedi ? [{ od: m, iznos: vrijedi.iznos }] : []), ...cijene.filter((c) => c.od > m)];
              if (nove.length)
                await tx.cijenaNajma.createMany({ data: nove.map((c) => ({ firmaId: f, planId: novi.id, od: d(`${c.od}-01`), iznos: c.iznos })) });
            }
            if (preneseno) {
              await tx.servisniNalog.update({ where: { id: n.id }, data: { zamjenaDo: d(u.datum) } });
              opisNajma = ` Najam ${ug.broj} prenesen na ${n.zamjenski?.serijski} od ${hr(od)}`;
            }
          } else {
            const kraj = u.datum < dan(plan.od) ? dan(plan.od) : u.datum;
            await tx.uredajNaUgovoru.update({ where: { id: plan.id }, data: { do: d(kraj) } });
            const p = await podaciZaNaplatu(tx, f, n.ugovorNajmaId);
            visakNajma = visak(
              p.uvjeti,
              p.motor.find((x) => x.uredajId === plan.id)!,
              p.fakturirano,
            ).reduce((s, x) => s + x.razlika, 0);
            opisNajma = ` Naplata najma ${ug.broj} do ${hr(kraj)}${visakNajma ? `, višak za odobrenje ${(visakNajma / 100).toFixed(2)} €` : ""}.`;
          }
        }
      }
      // zamjenski se vraća na skladište i kad se najam nije mogao prenijeti (nema aktivnog plana ili je ugovor završio)
      if (i.zamjena === "povratZamjene" || (i.zamjena === "zamjenaUNajam" && !preneseno)) await povratZamjene(tx, a, n, u.skladisteId, u.datum);
      await tx.servisniNalog.update({ where: { id: n.id }, data: { status: u.ishod, zatvoren: d(u.datum), verzija: { increment: 1 } } });
      await dogadaj(tx, a, n.id, u.napomena?.trim() ? `${STATUSI_SERVISA[u.ishod]}: ${u.napomena.trim()}` : STATUSI_SERVISA[u.ishod], {
        status: u.ishod,
      });
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: a.korisnikId,
        ip: a.ip,
        radnja: u.ishod === "OTPISAN" ? "servis.otpis" : "servis.zavrsi",
        entitet: "ServisniNalog",
        entitetId: n.id,
        opis: `Servisni nalog ${n.broj}: ${STATUSI_SERVISA[u.ishod].toLowerCase()} (${n.uredaj.serijski}).${opisNajma}`,
        staro: { status: n.status },
        novo: { status: u.ishod },
      });
      return { visak: visakNajma };
    },
    { timeout: 30_000 },
  );
}

/** Brisanje tek zaprimljenog naloga (npr. greškom otvoren): uređaj se vraća u stanje prije. */
export async function obrisiNalog(db: PrismaClient, a: Akter, id: string): Promise<void> {
  const f = a.firmaId;
  await db.$transaction(async (tx) => {
    const n = await zakljucajNalog(tx, f, id);
    const g = provjeriBrisanje({ status: n.status, imaoZamjenu: n.imaoZamjenu });
    if (g) throw new GreskaKorisniku(g);
    if (await tx.prilog.count({ where: { firmaId: f, entitet: "ServisniNalog", entitetId: n.id } }))
      throw new GreskaKorisniku("Nalog ima priloge — prvo ih obrišite ili nalog otkažite.");
    if (n.status !== "PRIJAVLJEN")
      await promijeniStanje(tx, { firmaId: f, korisnikId: a.korisnikId }, [n.uredajId], "izlazSaServisa", {
        dokument: { vrsta: "Servisni nalog", broj: `${n.broj} (obrisan)` },
        opis: "Servisni nalog obrisan",
      });
    await tx.dogadajServisa.deleteMany({ where: { firmaId: f, nalogId: n.id } });
    await tx.servisniNalog.delete({ where: { id: n.id } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "servis.obrisi",
      entitet: "ServisniNalog",
      entitetId: n.id,
      opis: `Obrisan servisni nalog ${n.broj} (${n.uredaj.serijski})`,
    });
  });
}

// ——— portal (korak 5.3) ———

export const NAJVISE_FOTOGRAFIJA = 4;

/**
 * Prijava kvara s portala: nalog „prijavljen“ (uređaj ostaje kod klijenta dok ga servis ne zaprimi),
 * do 4 fotografije kao javni prilozi. Samo za uređaj klijenta koji nije već na otvorenom nalogu.
 */
export async function prijaviKvarPortal(
  db: PrismaClient,
  k: { firmaId: string; partnerId: string; ip: string | null; ime: string },
  u: { uredajId: string; opisKvara: string; kontakt: string | null },
  fotografije: readonly Datoteka[],
  sada = new Date(),
): Promise<{ id: string; broj: string }> {
  if (!jeUuid(u.uredajId)) throw new GreskaKorisniku("Odaberite uređaj.");
  const opis = u.opisKvara.trim();
  if (opis.length < 3) throw new GreskaKorisniku("Opišite kvar.");
  if (opis.length > 2000) throw new GreskaKorisniku("Opis kvara je predug (najviše 2000 znakova).");
  if (fotografije.length > NAJVISE_FOTOGRAFIJA) throw new GreskaKorisniku(`Najviše ${NAJVISE_FOTOGRAFIJA} fotografije.`);
  const slike = fotografije.map((d) => {
    const r = provjeriPrilog(d.naziv, d.velicina);
    if (!r.ok) throw new GreskaKorisniku(r.greska);
    if (!r.vrsta.startsWith("image/")) throw new GreskaKorisniku(`„${r.naziv}“ nije fotografija (JPG, PNG, WEBP…).`);
    if (d.sadrzaj.byteLength !== d.velicina) throw new GreskaKorisniku(`Datoteka „${r.naziv}“ nije potpuno poslana.`);
    return { ...d, naziv: r.naziv, vrsta: r.vrsta };
  });
  const f = k.firmaId;
  const datum = danas(sada);
  const ime = `${k.ime} (portal)`;
  return db.$transaction(async (tx) => {
    const [r] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM "Uredaj" WHERE "firmaId" = ${f}::uuid AND id = ${u.uredajId}::uuid AND "partnerId" = ${k.partnerId}::uuid FOR UPDATE`;
    if (!r) throw new GreskaKorisniku("Uređaj ne postoji.");
    const ur = await tx.uredaj.findFirstOrThrow({ where: { id: r.id, firmaId: f }, select: { id: true, serijski: true, stanje: true } });
    if (ur.stanje !== "PRODAN" && ur.stanje !== "U_NAJMU") throw new GreskaKorisniku(`Uređaj ${ur.serijski} je već na servisu ili nije vaš.`);
    const otvoren = await tx.servisniNalog.findFirst({
      where: { firmaId: f, uredajId: ur.id, status: { in: [...OTVORENI_STATUSI] } },
      select: { broj: true },
    });
    if (otvoren) throw new GreskaKorisniku(`Za uređaj ${ur.serijski} već postoji otvoren nalog ${otvoren.broj}.`);
    const plan =
      ur.stanje === "U_NAJMU"
        ? await tx.uredajNaUgovoru.findFirst({
            where: { firmaId: f, uredajId: ur.id, od: { lte: d(datum) }, OR: [{ do: null }, { do: { gte: d(datum) } }] },
            select: { ugovorId: true },
          })
        : null;
    const godina = Number(datum.slice(0, 4));
    const redni = await sljedeciBroj(tx, f, "servis", godina);
    const broj = oznakaDokumenta("SRV", redni, godina);
    const n = await tx.servisniNalog.create({
      data: {
        firmaId: f,
        broj,
        godina,
        redni,
        datum: d(datum),
        uredajId: ur.id,
        partnerId: k.partnerId,
        ugovorNajmaId: plan?.ugovorId ?? null,
        stanjePrije: ur.stanje,
        status: "PRIJAVLJEN",
        opisKvara: opis,
        kontakt: u.kontakt?.trim().slice(0, 200) || null,
        izvor: "PORTAL",
        korisnikId: null,
        korisnik: ime,
      },
      select: { id: true, broj: true },
    });
    for (const s of slike)
      await tx.prilog.create({
        data: {
          firmaId: f,
          entitet: "ServisniNalog",
          entitetId: n.id,
          naziv: s.naziv,
          vrsta: s.vrsta,
          velicina: s.velicina,
          sadrzaj: s.sadrzaj as Uint8Array<ArrayBuffer>,
          javno: true,
          korisnikId: null,
          korisnik: ime,
        },
      });
    await dogadaj(tx, { firmaId: f, korisnikId: null, ip: k.ip, ime }, n.id, `Prijava kvara: ${opis}`, { status: "PRIJAVLJEN" });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: null,
      ip: k.ip,
      radnja: "servis.prijava",
      entitet: "ServisniNalog",
      entitetId: n.id,
      opis: `Prijava kvara s portala ${broj}: ${ur.serijski} (${ime}${slike.length ? `, fotografija: ${slike.length}` : ""})`,
    });
    return n;
  });
}

/** Zaprimanje uređaja za kvar prijavljen s portala: tek sada uređaj prelazi „na servis“. */
export async function zaprimiPrijavu(db: PrismaClient, a: Akter, id: string, u: { datum: string; skladisteId: string | null }, sada = new Date()) {
  if (!jeDatum(u.datum) || usporedi(u.datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum nije ispravan.");
  if (u.skladisteId !== null && !jeUuid(u.skladisteId)) throw new GreskaKorisniku("Odaberite skladište.");
  const f = a.firmaId;
  await db.$transaction(async (tx) => {
    const n = await zakljucajNalog(tx, f, id);
    if (n.status !== "PRIJAVLJEN") throw new GreskaKorisniku("Uređaj je već zaprimljen.");
    if (u.datum < dan(n.datum)) throw new GreskaKorisniku("Uređaj ne može biti zaprimljen prije prijave kvara.");
    await tx.$queryRaw`SELECT id FROM "Uredaj" WHERE id = ${n.uredajId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const ur = await tx.uredaj.findFirstOrThrow({ where: { id: n.uredajId, firmaId: f }, select: { stanje: true, partnerId: true } });
    if (ur.partnerId !== n.partnerId) throw new GreskaKorisniku("Uređaj više nije kod ovog klijenta — otkažite prijavu.");
    if (u.skladisteId && !(await tx.skladiste.count({ where: { id: u.skladisteId, firmaId: f, aktivan: true } })))
      throw new GreskaKorisniku("Odaberite aktivno skladište.");
    await promijeniStanje(tx, { firmaId: f, korisnikId: a.korisnikId }, [n.uredajId], "ulazNaServis", {
      ...(u.skladisteId ? { skladisteId: u.skladisteId } : {}),
      dokument: dokument(n),
      opis: `Prijem na servis (prijava s portala): ${n.opisKvara.slice(0, 200)}`,
    });
    await tx.servisniNalog.update({
      where: { id: n.id },
      data: { status: "ZAPRIMLJEN", stanjePrije: ur.stanje, datum: d(u.datum), verzija: { increment: 1 } },
    });
    await dogadaj(tx, a, n.id, "Uređaj zaprimljen na servis", { status: "ZAPRIMLJEN" });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "servis.zaprimi",
      entitet: "ServisniNalog",
      entitetId: n.id,
      opis: `Servisni nalog ${n.broj}: zaprimljen uređaj ${n.uredaj.serijski} (prijava s portala)`,
    });
  });
}

/** Prilog naloga vidljiv klijentu na portalu ili ne (interni prilozi nikad ne idu klijentu). */
export async function postaviJavnostPriloga(db: PrismaClient, a: Akter, nalogId: string, prilogId: string, javno: boolean) {
  if (!jeUuid(nalogId) || !jeUuid(prilogId)) throw new GreskaKorisniku("Prilog ne postoji.");
  await db.$transaction(async (tx) => {
    const p = await tx.prilog.findFirst({
      where: { id: prilogId, firmaId: a.firmaId, entitet: "ServisniNalog", entitetId: nalogId },
      select: { naziv: true, javno: true },
    });
    if (!p) throw new GreskaKorisniku("Prilog ne postoji.");
    await tx.prilog.update({ where: { id: prilogId }, data: { javno } });
    await zapisiDnevnik(tx, {
      firmaId: a.firmaId,
      korisnikId: a.korisnikId,
      ip: a.ip,
      radnja: "servis.prilozi",
      entitet: "ServisniNalog",
      entitetId: nalogId,
      opis: `Prilog „${p.naziv}“ ${javno ? "vidljiv klijentu" : "samo interno"}`,
      staro: { javno: p.javno },
      novo: { javno },
    });
  });
}

/** Aktivni plan najma uređaja na datum (bilo koji ugovor) ili null. */
export async function aktivniPlan(tx: Tx | PrismaClient, firmaId: string, uredajId: string, datum: string) {
  return tx.uredajNaUgovoru.findFirst({
    where: { firmaId, uredajId, OR: [{ do: null }, { do: { gte: d(datum) } }] },
    select: { id: true, ugovorId: true },
  });
}
