import type { Prisma } from "@/generated/prisma/client";
import { jeUuid } from "@/domain/id";
import { prijelaz, type Stanje, type VrstaRadnje } from "@/domain/stanja-uredaja";
import { GreskaKorisniku } from "@/lib/greske";

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
