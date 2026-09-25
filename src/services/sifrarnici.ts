import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { centiIzDecimala, centiUDecimal } from "@/domain/novac";
import type { Vrijednost } from "@/domain/polja";
import { imaPosebno } from "@/domain/prava";
import { jeUuid } from "@/domain/id";
import { GreskaKorisniku } from "@/lib/greske";
import { jeDecimalno, type DefinicijaSifrarnika } from "@/lib/sifrarnici";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

type Tx = Prisma.TransactionClient;
type Zapis = Record<string, unknown> & { id: string; naziv: string; aktivan: boolean; firmaId: string };
/** Zajednički oblik Prisma delegata šifrarnika (svi imaju naziv, aktivan, firmaId). */
type Delegat = {
  findFirst(a: object): Promise<Zapis | null>;
  findMany(a: object): Promise<Zapis[]>;
  count(a: object): Promise<number>;
  create(a: object): Promise<Zapis>;
  update(a: object): Promise<Zapis>;
  updateMany(a: object): Promise<{ count: number }>;
  delete(a: object): Promise<Zapis>;
};

export function delegat(tx: Tx | PrismaClient, model: string): Delegat {
  return (tx as unknown as Record<string, Delegat>)[model]!;
}

/** Vrijednosti iz obrasca → podaci za bazu (Decimal kao tekst). */
function uBazu(def: DefinicijaSifrarnika, v: Record<string, Vrijednost>, vidiNabavne: boolean): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const p of def.polja) {
    if (p.osjetljivo && !vidiNabavne) continue; // bez prava se ne mijenja
    const x = v[p.ime];
    if (x === undefined) continue;
    d[p.ime] = jeDecimalno(p) && typeof x === "number" ? centiUDecimal(x) : x;
  }
  return d;
}

/** Zapis iz baze → vrijednosti za dnevnik i obrazac (Decimal → centi). */
export function izBaze(def: DefinicijaSifrarnika, z: Record<string, unknown>): Record<string, Vrijednost> {
  const o: Record<string, Vrijednost> = {};
  for (const p of def.polja) {
    const x = z[p.ime];
    o[p.ime] = x === null || x === undefined ? null : jeDecimalno(p) ? centiIzDecimala(String(x)) : (x as Vrijednost);
  }
  return o;
}

async function provjeriReference(tx: Tx, def: DefinicijaSifrarnika, firmaId: string, v: Record<string, Vrijednost>, stari: Zapis | null) {
  for (const p of def.polja) {
    if (p.vrsta !== "odabir" || !p.izvor) continue;
    const id = v[p.ime];
    if (id === null || id === undefined) continue;
    if (stari && stari[p.ime] === id) continue; // nepromijenjeno (smije biti i neaktivno)
    const ref = await delegat(tx, p.izvor).findFirst({ where: { id: String(id), firmaId }, select: { id: true, aktivan: true } });
    if (!ref) throw new GreskaKorisniku(`${p.oznaka}: odabrana vrijednost ne postoji.`);
    if (!ref.aktivan) throw new GreskaKorisniku(`${p.oznaka}: odabrana vrijednost je deaktivirana.`);
  }
}

export async function spremiSifrarnik(
  db: PrismaClient,
  akter: Akter,
  def: DefinicijaSifrarnika,
  id: string | null,
  v: Record<string, Vrijednost>,
): Promise<string> {
  const vidiNabavne = imaPosebno(akter.prava, "costs");
  return db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `sifrarnik:${def.model}:${akter.firmaId}`);
    const d = delegat(tx, def.model);
    if (id !== null && !jeUuid(id)) throw new GreskaKorisniku(`${def.jednina} ne postoji.`);
    const stari = id ? await d.findFirst({ where: { id, firmaId: akter.firmaId } }) : null;
    if (id && !stari) throw new GreskaKorisniku(`${def.jednina} ne postoji.`);

    await provjeriReference(tx, def, akter.firmaId, v, stari);

    const naziv = String(v["naziv"] ?? "").trim();
    const opseg = Object.fromEntries((def.jedinstvenoUnutar ?? []).map((p) => [p, v[p] ?? stari?.[p]]));
    const isti = await d.findFirst({
      where: { firmaId: akter.firmaId, naziv: { equals: naziv, mode: "insensitive" }, ...opseg, ...(id ? { NOT: { id } } : {}) },
      select: { id: true, aktivan: true },
    });
    if (isti) throw new GreskaKorisniku(`${def.jednina} „${naziv}“ već postoji${isti.aktivan ? "" : " (deaktiviran — aktivirajte ga)"}.`);

    const podaci = uBazu(def, v, vidiNabavne);
    if (def.jedinstvenaKvacica && podaci[def.jedinstvenaKvacica] === true) {
      await d.updateMany({
        where: { firmaId: akter.firmaId, [def.jedinstvenaKvacica]: true, ...(id ? { NOT: { id } } : {}) },
        data: { [def.jedinstvenaKvacica]: false },
      });
    }

    const zapis = stari ? await d.update({ where: { id: stari.id }, data: podaci }) : await d.create({ data: { ...podaci, firmaId: akter.firmaId } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "sifrarnici.spremi",
      entitet: def.entitet,
      entitetId: zapis.id,
      opis: `${stari ? "Izmijenjen" : "Novi"} šifrarnik ${def.naslov.toLowerCase()}: ${naziv}`,
      staro: stari ? izBaze(def, stari) : null,
      novo: izBaze(def, zapis),
      osjetljiva: def.polja.filter((p) => p.osjetljivo).map((p) => p.ime),
    });
    return zapis.id;
  });
}

export async function postaviAktivnost(db: PrismaClient, akter: Akter, def: DefinicijaSifrarnika, id: string, aktivan: boolean): Promise<void> {
  await db.$transaction(async (tx) => {
    if (!jeUuid(id)) throw new GreskaKorisniku(`${def.jednina} ne postoji.`);
    const d = delegat(tx, def.model);
    const z = await d.findFirst({ where: { id, firmaId: akter.firmaId } });
    if (!z) throw new GreskaKorisniku(`${def.jednina} ne postoji.`);
    if (z.aktivan === aktivan) return;
    await d.update({ where: { id }, data: { aktivan } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "sifrarnici.aktivnost",
      entitet: def.entitet,
      entitetId: id,
      opis: `${aktivan ? "Aktiviran" : "Deaktiviran"} šifrarnik ${def.naslov.toLowerCase()}: ${z.naziv}`,
      staro: { aktivan: z.aktivan },
      novo: { aktivan },
    });
  });
}

/** Brisanje samo ako se zapis nigdje ne koristi (inače deaktivacija). */
export async function obrisiSifrarnik(db: PrismaClient, akter: Akter, def: DefinicijaSifrarnika, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    if (!jeUuid(id)) throw new GreskaKorisniku(`${def.jednina} ne postoji.`);
    const d = delegat(tx, def.model);
    const z = await d.findFirst({ where: { id, firmaId: akter.firmaId } });
    if (!z) throw new GreskaKorisniku(`${def.jednina} ne postoji.`);
    for (const r of def.reference) {
      const broj = await delegat(tx, r.model).count({ where: { [r.polje]: id } });
      if (broj > 0) throw new GreskaKorisniku(`Koristi se kod ${broj} ${r.naziv}; umjesto brisanja ga deaktivirajte.`);
    }
    try {
      await d.delete({ where: { id } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2003") throw new GreskaKorisniku("Zapis se koristi; umjesto brisanja ga deaktivirajte.");
      throw e;
    }
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "sifrarnici.obrisi",
      entitet: def.entitet,
      entitetId: id,
      opis: `Obrisan šifrarnik ${def.naslov.toLowerCase()}: ${z.naziv}`,
      staro: izBaze(def, z),
      osjetljiva: def.polja.filter((p) => p.osjetljivo).map((p) => p.ime),
    });
  });
}

/** Početni šifrarnici nove firme. */
export async function napraviZadaneSifrarnike(tx: Tx | PrismaClient, firmaId: string): Promise<void> {
  await tx.skladiste.create({ data: { firmaId, naziv: "Glavno skladište", zadano: true } });
  await tx.stanjeRobe.createMany({ data: ["Novo", "Rabljeno", "Obnovljeno", "Neispravno"].map((naziv) => ({ firmaId, naziv })) });
  await tx.kategorija.createMany({
    data: ["Prijenosno računalo", "Stolno računalo", "Monitor", "Pisač", "Multifunkcijski uređaj", "Tablet", "Mobitel", "Ostalo"].map((naziv) => ({
      firmaId,
      naziv,
    })),
  });
}
