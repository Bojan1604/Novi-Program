import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { jeDatum } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { dopustenaPolja, mozeSeObrisati, promijenjenaPolja, type PoljeIspravka, type VezeUredaja } from "@/domain/kartica-uredaja";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import { imaPosebno } from "@/domain/prava";
import { prijelaz, provjeriSerijski, type Stanje, type VrstaRadnje } from "@/domain/stanja-uredaja";
import { GreskaKorisniku } from "@/lib/greske";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

type Tx = Prisma.TransactionClient;

export type Izvrsitelj = { firmaId: string; korisnikId: string | null };

export type PodaciPrijelaza = {
  /** skladište nakon radnje (zaprimanje, povrat, premještaj); inače ostaje/briše se po pravilu */
  skladisteId?: string | null;
  /** kupac/najmoprimac (prodaja, najam) */
  partnerId?: string | null;
  poslovnicaId?: string | null;
  dokument?: { vrsta: string; id?: string | null; broj?: string | null };
  opis?: string | null;
};

/**
 * JEDINO mjesto promjene stanja uređaja. Mora se pozvati unutar transakcije:
 * retci uređaja se zaključavaju (FOR UPDATE, redom po id-u), pa dvije kartice ili dva
 * korisnika ne mogu isti uređaj istovremeno prodati i dati u najam.
 * Nedopušten prijelaz za bilo koji uređaj → GreskaKorisniku s razlozima, ništa se ne mijenja.
 */
export async function promijeniStanje(
  tx: Tx,
  izvrsitelj: Izvrsitelj,
  uredajIds: readonly string[],
  radnja: VrstaRadnje,
  podaci: PodaciPrijelaza = {},
): Promise<void> {
  const idevi = [...new Set(uredajIds)];
  if (idevi.length === 0) return;
  if (!idevi.every(jeUuid)) throw new GreskaKorisniku("Neispravan uređaj.");
  await tx.$queryRaw`SELECT id FROM "Uredaj" WHERE "firmaId" = ${izvrsitelj.firmaId}::uuid AND id = ANY(${idevi}::uuid[]) ORDER BY id FOR UPDATE`;
  const uredaji = await tx.uredaj.findMany({
    where: { firmaId: izvrsitelj.firmaId, id: { in: idevi } },
    select: { id: true, serijski: true, stanje: true, stanjePrijeServisa: true, skladisteId: true, partnerId: true, poslovnicaId: true },
  });
  if (uredaji.length !== idevi.length) throw new GreskaKorisniku("Neki od uređaja ne postoje.");

  const greske: string[] = [];
  const promjene = uredaji.map((u) => {
    const r = prijelaz(radnja, u.stanje as Stanje, u.stanjePrijeServisa as Stanje | null, u.serijski);
    if (!r.ok) greske.push(r.razlog);
    return { u, r };
  });
  if (greske.length) {
    throw new GreskaKorisniku(
      greske.length === 1
        ? greske[0]!
        : `${greske.length} uređaja nije moguće obraditi: ${greske.slice(0, 5).join(" ")}${greske.length > 5 ? " …" : ""}`,
    );
  }

  const ime = izvrsitelj.korisnikId
    ? ((await tx.korisnik.findUnique({ where: { id: izvrsitelj.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat")
    : "Sustav";
  const vrijeme = new Date();
  const dogadaji: Prisma.DogadajUredajaCreateManyInput[] = [];

  for (const { u, r } of promjene) {
    if (!r.ok) continue;
    const skladisteId =
      r.naSkladistu === true
        ? podaci.skladisteId !== undefined
          ? podaci.skladisteId
          : u.skladisteId
        : r.naSkladistu === false
          ? null
          : podaci.skladisteId !== undefined
            ? podaci.skladisteId
            : u.skladisteId;
    if (r.naSkladistu === true && !skladisteId) throw new GreskaKorisniku(`Za uređaj ${u.serijski} odaberite skladište.`);
    const partner = ["prodaja", "najam"].includes(radnja)
      ? { partnerId: podaci.partnerId ?? null, poslovnicaId: podaci.poslovnicaId ?? null }
      : ["stornoProdaje", "povratIzNajma", "otpis", "zaprimanje"].includes(radnja)
        ? { partnerId: null, poslovnicaId: null }
        : r.novo === "PRODAN" || r.novo === "U_NAJMU"
          ? { partnerId: u.partnerId, poslovnicaId: u.poslovnicaId }
          : { partnerId: podaci.partnerId !== undefined ? podaci.partnerId : u.partnerId, poslovnicaId: u.poslovnicaId };
    if ((radnja === "prodaja" || radnja === "najam") && !partner.partnerId)
      throw new GreskaKorisniku(`Za ${radnja === "prodaja" ? "prodaju" : "najam"} odaberite kupca.`);

    await tx.uredaj.update({
      where: { id: u.id },
      data: {
        stanje: r.novo,
        stanjePrijeServisa: radnja === "ulazNaServis" ? u.stanje : radnja === "izlazSaServisa" ? null : undefined,
        skladisteId,
        ...partner,
        verzija: { increment: 1 },
      },
    });
    dogadaji.push({
      firmaId: izvrsitelj.firmaId,
      uredajId: u.id,
      vrijeme,
      radnja,
      staroStanje: u.stanje,
      novoStanje: r.novo,
      skladisteOdId: u.skladisteId,
      skladisteDoId: skladisteId,
      partnerId: partner.partnerId,
      dokumentVrsta: podaci.dokument?.vrsta ?? null,
      dokumentId: podaci.dokument?.id ?? null,
      dokumentBroj: podaci.dokument?.broj ?? null,
      opis: podaci.opis ?? null,
      korisnikId: izvrsitelj.korisnikId,
      korisnik: ime,
    });
  }
  await tx.dogadajUredaja.createMany({ data: dogadaji });
}

export type NoviUredaj = {
  serijski: string;
  modelId: string;
  nabavnaCijena: string | null;
  nabavniDatum: Date | null;
  jamstvoDo: Date | null;
  stanjeRobeId: string | null;
  cpu?: string | null;
  ram?: string | null;
  disk?: string | null;
  ekran?: string | null;
  os?: string | null;
  napomena?: string | null;
};

/**
 * Novi uređaji (zaprimanje ili najava dolaska) — isto pravilo prijelaza kao za postojeće.
 * Serijski broj koji već postoji u firmi → GreskaKorisniku s popisom (i kod istovremenog unosa).
 */
export async function stvoriUredaje(
  tx: Tx,
  izvrsitelj: Izvrsitelj,
  radnja: "zaprimanje" | "najava",
  uredaji: readonly NoviUredaj[],
  podaci: { skladisteId: string | null; primkaId?: string | null; dokument?: PodaciPrijelaza["dokument"]; opis?: string | null },
): Promise<string[]> {
  for (const u of uredaji) {
    const r = prijelaz(radnja, null, null, u.serijski);
    if (!r.ok) throw new GreskaKorisniku(r.razlog);
  }
  const r = prijelaz(radnja, null);
  if (!r.ok) throw new GreskaKorisniku(r.razlog);
  if (r.naSkladistu === true && !podaci.skladisteId) throw new GreskaKorisniku("Odaberite skladište.");

  const postojeci = await tx.uredaj.findMany({
    where: { firmaId: izvrsitelj.firmaId, serijski: { in: uredaji.map((u) => u.serijski) } },
    select: { serijski: true, stanje: true, primka: { select: { broj: true } } },
    take: 20,
  });
  if (postojeci.length) {
    throw new GreskaKorisniku(`Već postoje u programu: ${postojeci.map((p) => `${p.serijski}${p.primka ? ` (${p.primka.broj})` : ""}`).join(", ")}.`);
  }

  const ime = izvrsitelj.korisnikId
    ? ((await tx.korisnik.findUnique({ where: { id: izvrsitelj.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat")
    : "Sustav";
  let stvoreni: { id: string; serijski: string }[];
  try {
    stvoreni = await tx.uredaj.createManyAndReturn({
      data: uredaji.map((u) => ({
        ...u,
        firmaId: izvrsitelj.firmaId,
        stanje: r.novo,
        skladisteId: r.naSkladistu === true ? podaci.skladisteId : null,
        primkaId: podaci.primkaId ?? null,
      })),
      select: { id: true, serijski: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      throw new GreskaKorisniku("Neki od serijskih brojeva upravo je zaprimljen drugom primkom. Osvježite i provjerite.");
    throw e;
  }
  const vrijeme = new Date();
  await tx.dogadajUredaja.createMany({
    data: stvoreni.map((u) => ({
      firmaId: izvrsitelj.firmaId,
      uredajId: u.id,
      vrijeme,
      radnja,
      staroStanje: null,
      novoStanje: r.novo,
      skladisteDoId: r.naSkladistu === true ? podaci.skladisteId : null,
      dokumentVrsta: podaci.dokument?.vrsta ?? null,
      dokumentId: podaci.dokument?.id ?? null,
      dokumentBroj: podaci.dokument?.broj ?? null,
      opis: podaci.opis ?? null,
      korisnikId: izvrsitelj.korisnikId,
      korisnik: ime,
    })),
  });
  return stvoreni.map((u) => u.id);
}

/** Veze uređaja s dokumentima (za pravila ispravka i brisanja) — iz primke i povijesti. */
export async function vezeUredaja(tx: Tx, firmaId: string, uredajId: string, primkaId: string | null): Promise<VezeUredaja> {
  const [primka, dokumenti] = await Promise.all([
    primkaId ? tx.primka.findFirst({ where: { id: primkaId, firmaId }, select: { broj: true } }) : null,
    tx.dogadajUredaja.findMany({
      where: { firmaId, uredajId, dokumentVrsta: { not: null } },
      distinct: ["dokumentVrsta", "dokumentId"],
      select: { dokumentVrsta: true, dokumentBroj: true },
      take: 100,
    }),
  ]);
  return { primka: primka?.broj ?? null, dokumenti: dokumenti.map((d) => ({ vrsta: d.dokumentVrsta!, broj: d.dokumentBroj })) };
}

export type IspravakUredaja = {
  /** verzija koju je korisnik gledao (netko drugi je u međuvremenu promijenio → greška) */
  verzija: number;
  serijski?: string;
  modelId?: string;
  /** centi; null = bez nabavne cijene */
  nabavnaCijena?: number | null;
  jamstvoDo?: string | null;
  stanjeRobeId?: string | null;
  cpu?: string | null;
  ram?: string | null;
  disk?: string | null;
  ekran?: string | null;
  os?: string | null;
  napomena?: string | null;
};

const NAZIVI_POLJA: Record<PoljeIspravka, string> = {
  serijski: "Serijski broj",
  modelId: "Model",
  nabavnaCijena: "Nabavna cijena",
  jamstvoDo: "Jamstvo do",
  stanjeRobeId: "Stanje robe",
  cpu: "Procesor",
  ram: "RAM",
  disk: "Disk",
  ekran: "Ekran",
  os: "Operacijski sustav",
  napomena: "Napomena",
};

const dan = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Ručni ispravak podataka uređaja. Stanje i lokacija se NE mijenjaju ovdje (samo `promijeniStanje`);
 * serijski i model samo dok uređaj nije ni na jednom dokumentu osim svoje primke.
 */
export async function ispraviUredaj(db: PrismaClient, akter: Akter, id: string, ulaz: IspravakUredaja): Promise<void> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Uređaj ne postoji.");
  const vidiNabavne = imaPosebno(akter.prava, "costs");
  await db.$transaction(async (tx) => {
    const f = akter.firmaId;
    await tx.$queryRaw`SELECT id FROM "Uredaj" WHERE id = ${id}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const u = await tx.uredaj.findFirst({ where: { id, firmaId: f } });
    if (!u) throw new GreskaKorisniku("Uređaj ne postoji.");
    if (u.verzija !== ulaz.verzija)
      throw new GreskaKorisniku("Netko je u međuvremenu promijenio ovaj uređaj. Osvježite stranicu i ponovite ispravak.");

    const staro: Partial<Record<PoljeIspravka, string | null>> = {
      serijski: u.serijski,
      modelId: u.modelId,
      nabavnaCijena: u.nabavnaCijena === null ? null : String(centiIzDecimala(u.nabavnaCijena.toFixed(2))),
      jamstvoDo: dan(u.jamstvoDo),
      stanjeRobeId: u.stanjeRobeId,
      cpu: u.cpu,
      ram: u.ram,
      disk: u.disk,
      ekran: u.ekran,
      os: u.os,
      napomena: u.napomena,
    };
    const novo: Partial<Record<PoljeIspravka, string | null>> = {};
    for (const k of Object.keys(NAZIVI_POLJA) as PoljeIspravka[]) {
      const v = ulaz[k];
      if (v === undefined) continue;
      if (k === "nabavnaCijena") {
        if (v !== null && (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)) throw new GreskaKorisniku("Nabavna cijena nije ispravna.");
        novo[k] = v === null ? null : String(v);
      } else if (typeof v === "string") {
        const t = v.trim();
        novo[k] = t === "" ? null : t.slice(0, k === "napomena" ? 2000 : 200);
      } else if (v === null) {
        novo[k] = null;
      }
    }
    if (novo.serijski !== undefined) {
      const r = provjeriSerijski(novo.serijski ?? "");
      if (!r.ok) throw new GreskaKorisniku(r.greska);
      novo.serijski = r.vrijednost;
    }
    if (novo.modelId === null) throw new GreskaKorisniku("Odaberite model.");

    const promijenjena = promijenjenaPolja(staro, novo);
    if (promijenjena.length === 0) throw new GreskaKorisniku("Ništa nije promijenjeno.");

    const { polja, zakljucano } = dopustenaPolja(await vezeUredaja(tx, f, id, u.primkaId), vidiNabavne);
    for (const p of promijenjena) {
      if (!polja.has(p)) {
        if (p === "nabavnaCijena") throw new GreskaKorisniku("Nemate pravo mijenjati nabavnu cijenu.");
        throw new GreskaKorisniku(zakljucano ?? `Polje „${NAZIVI_POLJA[p]}“ se ne smije mijenjati.`);
      }
    }
    if (promijenjena.includes("jamstvoDo") && novo.jamstvoDo !== null && !jeDatum(novo.jamstvoDo))
      throw new GreskaKorisniku("Datum jamstva nije ispravan.");
    for (const p of ["modelId", "stanjeRobeId"] as const) {
      const v = novo[p];
      if (!promijenjena.includes(p) || v === null || v === undefined) continue;
      if (!jeUuid(v)) throw new GreskaKorisniku("Neispravan odabir.");
      const postoji =
        p === "modelId" ? await tx.modelUredaja.count({ where: { id: v, firmaId: f } }) : await tx.stanjeRobe.count({ where: { id: v, firmaId: f } });
      if (!postoji) throw new GreskaKorisniku(p === "modelId" ? "Model ne postoji." : "Stanje robe ne postoji.");
    }
    if (promijenjena.includes("serijski")) {
      const drugi = await tx.uredaj.findFirst({ where: { firmaId: f, serijski: novo.serijski!, NOT: { id } }, select: { id: true } });
      if (drugi) throw new GreskaKorisniku(`Serijski broj ${novo.serijski} već ima drugi uređaj.`);
    }

    const data: Prisma.UredajUncheckedUpdateInput = { verzija: { increment: 1 } };
    for (const p of promijenjena) {
      const v = novo[p] ?? null;
      if (p === "nabavnaCijena") data.nabavnaCijena = v === null ? null : centiUDecimal(Number(v));
      else if (p === "jamstvoDo") data.jamstvoDo = v === null ? null : new Date(`${v}T00:00:00Z`);
      else if (p === "modelId") data.modelId = v!;
      else if (p === "serijski") data.serijski = v!;
      else data[p] = v;
    }
    try {
      await tx.uredaj.update({ where: { id }, data });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new GreskaKorisniku(`Serijski broj ${novo.serijski} već ima drugi uređaj.`);
      throw e;
    }
    const zaDnevnik = (o: Partial<Record<PoljeIspravka, string | null>>) =>
      Object.fromEntries(promijenjena.map((p) => [p, p === "nabavnaCijena" && o[p] != null ? centiUDecimal(Number(o[p])) : (o[p] ?? null)]));
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "uredaji.ispravak",
      entitet: "Uredaj",
      entitetId: id,
      opis: `Ispravak uređaja ${u.serijski}: ${promijenjena.map((p) => NAZIVI_POLJA[p].toLowerCase()).join(", ")}`,
      staro: zaDnevnik(staro),
      novo: zaDnevnik(novo),
    });
  });
}

/** Brisanje uređaja — samo bez ikakvih veza (primka, dokumenti). Briše i povijest i priloge. */
export async function obrisiUredaj(db: PrismaClient, akter: Akter, id: string): Promise<void> {
  if (!jeUuid(id)) throw new GreskaKorisniku("Uređaj ne postoji.");
  await db.$transaction(async (tx) => {
    const f = akter.firmaId;
    await tx.$queryRaw`SELECT id FROM "Uredaj" WHERE id = ${id}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const u = await tx.uredaj.findFirst({ where: { id, firmaId: f }, select: { serijski: true, primkaId: true, stanje: true, modelId: true } });
    if (!u) throw new GreskaKorisniku("Uređaj ne postoji.");
    const r = mozeSeObrisati(await vezeUredaja(tx, f, id, u.primkaId));
    if (!r.ok) throw new GreskaKorisniku(r.razlog);
    await tx.prilog.deleteMany({ where: { firmaId: f, entitet: "Uredaj", entitetId: id } });
    await tx.dogadajUredaja.deleteMany({ where: { firmaId: f, uredajId: id } });
    await tx.uredaj.delete({ where: { id } });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "uredaji.obrisi",
      entitet: "Uredaj",
      entitetId: id,
      opis: `Obrisan uređaj ${u.serijski}`,
      staro: { serijski: u.serijski, stanje: u.stanje, modelId: u.modelId },
    });
  });
}
