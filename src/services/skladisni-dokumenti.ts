import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { danas, datum as uDatum, jeDatum, usporedi } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import {
  jeVrsta,
  provjeriUredaj,
  provjeriZaglavlje,
  radnjaDokumenta,
  RAZLOZI_IZLAZA,
  VRSTE_DOKUMENATA,
  type VrstaDokumenta,
} from "@/domain/skladisni-dokumenti";
import { normalizirajSerijski, type Stanje, type VrstaRadnje } from "@/domain/stanja-uredaja";
import { oznakaDokumenta } from "@/domain/zaprimanje";
import { GreskaKorisniku } from "@/lib/greske";
import { sljedeciBroj } from "./brojac";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { promijeniStanje } from "./uredaji";

type Tx = Prisma.TransactionClient;

export const NAJVISE_NA_DOKUMENTU = 5000;

export type UlazDokumenta = {
  vrsta: string;
  datum: string;
  skladisteIzId: string | null;
  skladisteUId: string | null;
  partnerId: string | null;
  razlog: string | null;
  napomena: string | null;
  serijski: string[];
};

const d = (x: string) => new Date(`${x}T00:00:00Z`);

async function imeKorisnika(tx: Tx, id: string): Promise<string> {
  return (await tx.korisnik.findUnique({ where: { id }, select: { ime: true } }))?.ime ?? "Nepoznat";
}

/**
 * Izdaje međuskladišnicu, izlaz ili povrat. Izlaz ne mijenja uređaje dok ga ne odobri DRUGI korisnik
 * (dokument „čeka odobrenje“, uređaji ne smiju na drugi dokument koji čeka).
 */
export async function izdajDokument(db: PrismaClient, akter: Akter, ulaz: UlazDokumenta, sada = new Date()) {
  if (!jeVrsta(ulaz.vrsta)) throw new GreskaKorisniku("Nepoznata vrsta dokumenta.");
  const vrsta: VrstaDokumenta = ulaz.vrsta;
  const opis = VRSTE_DOKUMENATA[vrsta];
  if (!jeDatum(ulaz.datum)) throw new GreskaKorisniku("Datum nije ispravan.");
  const datum = uDatum(ulaz.datum);
  if (usporedi(datum, danas(sada)) > 0) throw new GreskaKorisniku("Datum ne smije biti u budućnosti.");
  for (const id of [ulaz.skladisteIzId, ulaz.skladisteUId, ulaz.partnerId])
    if (id !== null && !jeUuid(id)) throw new GreskaKorisniku("Neispravan odabir.");
  const zaglavlje = {
    vrsta,
    skladisteIzId: vrsta === "POVRAT" ? null : ulaz.skladisteIzId,
    skladisteUId: vrsta === "IZLAZ" ? null : ulaz.skladisteUId,
    razlog: vrsta === "IZLAZ" ? ulaz.razlog : null,
  };
  const greska = provjeriZaglavlje(zaglavlje);
  if (greska) throw new GreskaKorisniku(greska);
  if (zaglavlje.razlog && !(RAZLOZI_IZLAZA as readonly string[]).includes(zaglavlje.razlog))
    throw new GreskaKorisniku("Odaberite razlog izlaza s popisa.");

  const serijski = ulaz.serijski.map(normalizirajSerijski).filter(Boolean);
  if (serijski.length === 0) throw new GreskaKorisniku("Dodajte barem jedan uređaj.");
  if (serijski.length > NAJVISE_NA_DOKUMENTU) throw new GreskaKorisniku(`Najviše ${NAJVISE_NA_DOKUMENTU} uređaja na dokumentu.`);
  const dupli = serijski.filter((s, i) => serijski.indexOf(s) !== i);
  if (dupli.length) throw new GreskaKorisniku(`Upisan dvaput: ${[...new Set(dupli)].slice(0, 5).join(", ")}.`);

  return db.$transaction(
    async (tx) => {
      const f = akter.firmaId;
      for (const [id, oznaka, aktivno] of [
        [zaglavlje.skladisteIzId, "iz", false],
        [zaglavlje.skladisteUId, "u", true],
      ] as const) {
        if (!id) continue;
        const s = await tx.skladiste.findFirst({ where: { id, firmaId: f }, select: { aktivan: true } });
        if (!s || (aktivno && !s.aktivan)) throw new GreskaKorisniku(`Odaberite ${aktivno ? "aktivno " : ""}skladište „${oznaka}“.`);
      }
      if (ulaz.partnerId && !(await tx.partner.count({ where: { id: ulaz.partnerId, firmaId: f } })))
        throw new GreskaKorisniku("Partner ne postoji.");

      // zaključaj uređaje (redom po id-u), pa provjeri
      await tx.$queryRaw`SELECT id FROM "Uredaj" WHERE "firmaId" = ${f}::uuid AND serijski = ANY(${serijski}::text[]) ORDER BY id FOR UPDATE`;
      const uredaji = await tx.uredaj.findMany({
        where: { firmaId: f, serijski: { in: serijski } },
        select: { id: true, serijski: true, stanje: true, skladisteId: true },
      });
      const nadjeni = new Set(uredaji.map((u) => u.serijski));
      const nema = serijski.filter((s) => !nadjeni.has(s));
      if (nema.length) throw new GreskaKorisniku(`Nisu u programu: ${nema.slice(0, 10).join(", ")}${nema.length > 10 ? " …" : ""}.`);
      const greske = uredaji.map((u) => provjeriUredaj(zaglavlje, { ...u, stanje: u.stanje as Stanje })).filter((g): g is string => !!g);
      if (greske.length)
        throw new GreskaKorisniku(greske.length === 1 ? greske[0]! : `${greske.length} uređaja ne može na dokument: ${greske.slice(0, 5).join(" ")}`);
      const naCekanju = await tx.stavkaSkladisnogDokumenta.findMany({
        where: { firmaId: f, uredajId: { in: uredaji.map((u) => u.id) }, dokument: { status: "CEKA_ODOBRENJE" } },
        select: { uredaj: { select: { serijski: true } }, dokument: { select: { broj: true } } },
        take: 5,
      });
      if (naCekanju.length) {
        throw new GreskaKorisniku(
          `Uređaji čekaju odobrenje drugog dokumenta: ${naCekanju.map((s) => `${s.uredaj.serijski} (${s.dokument.broj})`).join(", ")}.`,
        );
      }

      const godina = Number(datum.slice(0, 4));
      const redni = await sljedeciBroj(tx, f, opis.brojac, godina);
      const broj = oznakaDokumenta(opis.prefiks, redni, godina);
      const ime = await imeKorisnika(tx, akter.korisnikId);
      const dok = await tx.skladisniDokument.create({
        data: {
          firmaId: f,
          vrsta,
          broj,
          godina,
          redni,
          datum: d(datum),
          skladisteIzId: zaglavlje.skladisteIzId,
          skladisteUId: zaglavlje.skladisteUId,
          partnerId: ulaz.partnerId,
          razlog: zaglavlje.razlog,
          napomena: ulaz.napomena,
          brojUredaja: uredaji.length,
          status: opis.trebaOdobrenje ? "CEKA_ODOBRENJE" : "IZDAN",
          korisnikId: akter.korisnikId,
          korisnik: ime,
        },
      });
      await tx.stavkaSkladisnogDokumenta.createMany({
        data: uredaji.map((u) => ({ firmaId: f, dokumentId: dok.id, uredajId: u.id, staroStanje: u.stanje })),
      });
      if (opis.trebaOdobrenje) {
        await tx.odobrenje.create({
          data: {
            firmaId: f,
            vrsta: "izlaz",
            entitet: "SkladisniDokument",
            entitetId: dok.id,
            opis: `${opis.naziv} ${broj}: ${uredaji.length} uređaja (${zaglavlje.razlog})`,
            podnioId: akter.korisnikId,
            podnio: ime,
          },
        });
      } else {
        await izvrsi(tx, akter, dok);
      }
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "skladisni.izdaj",
        entitet: "SkladisniDokument",
        entitetId: dok.id,
        opis: `${opis.naziv} ${broj}: ${uredaji.length} uređaja${opis.trebaOdobrenje ? " — čeka odobrenje" : ""}`,
        novo: { broj, datum, vrsta: opis.naziv, brojUredaja: uredaji.length, razlog: zaglavlje.razlog, status: dok.status },
      });
      return { id: dok.id, broj, status: dok.status };
    },
    { timeout: 120_000 },
  );
}

/** Provodi dokument nad uređajima (jedna radnja po skupini stanja) — kroz jedino pravilo prijelaza. */
async function izvrsi(
  tx: Tx,
  akter: Akter,
  dok: { id: string; vrsta: string; broj: string; skladisteUId: string | null; partnerId: string | null; razlog: string | null },
): Promise<void> {
  const stavke = await tx.stavkaSkladisnogDokumenta.findMany({
    where: { firmaId: akter.firmaId, dokumentId: dok.id },
    select: { uredajId: true, uredaj: { select: { stanje: true } } },
  });
  const poRadnji = new Map<VrstaRadnje, string[]>();
  for (const s of stavke) {
    const r = radnjaDokumenta(dok.vrsta as VrstaDokumenta, s.uredaj.stanje as Stanje);
    if (!r) throw new GreskaKorisniku("Neki uređaji s dokumenta više nisu u stanju za ovu radnju.");
    poRadnji.set(r, [...(poRadnji.get(r) ?? []), s.uredajId]);
  }
  for (const [radnja, ids] of poRadnji) {
    await promijeniStanje(tx, { firmaId: akter.firmaId, korisnikId: akter.korisnikId }, ids, radnja, {
      ...(dok.skladisteUId ? { skladisteId: dok.skladisteUId } : {}),
      dokument: { vrsta: VRSTE_DOKUMENATA[dok.vrsta as VrstaDokumenta].naziv, id: dok.id, broj: dok.broj },
      opis: dok.razlog,
    });
  }
}

/**
 * Odluka o zahtjevu. Nitko ne odobrava (ni odbija) vlastiti zahtjev; odbijanje traži razlog.
 * Odobren izlaz se odmah provodi — ako se uređaj u međuvremenu pomaknuo, odobrenje ne uspije s razlogom.
 */
export async function odluciOZahtjevu(db: PrismaClient, akter: Akter, odobrenjeId: string, odobri: boolean, razlog: string | null): Promise<void> {
  if (!jeUuid(odobrenjeId)) throw new GreskaKorisniku("Zahtjev ne postoji.");
  const r = razlog?.trim() || null;
  if (!odobri && !r) throw new GreskaKorisniku("Upišite razlog odbijanja.");
  await db.$transaction(async (tx) => {
    const f = akter.firmaId;
    await tx.$queryRaw`SELECT id FROM "Odobrenje" WHERE id = ${odobrenjeId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
    const o = await tx.odobrenje.findFirst({ where: { id: odobrenjeId, firmaId: f } });
    if (!o) throw new GreskaKorisniku("Zahtjev ne postoji.");
    if (o.status !== "CEKA") throw new GreskaKorisniku(`O zahtjevu je već odlučeno (${o.odlucio ?? ""}).`);
    if (o.podnioId === akter.korisnikId) throw new GreskaKorisniku("Ne možete odlučiti o vlastitom zahtjevu — to mora drugi korisnik.");

    if (o.entitet === "SkladisniDokument") {
      await tx.$queryRaw`SELECT id FROM "SkladisniDokument" WHERE id = ${o.entitetId}::uuid AND "firmaId" = ${f}::uuid FOR UPDATE`;
      const dok = await tx.skladisniDokument.findFirst({ where: { id: o.entitetId, firmaId: f } });
      if (!dok || dok.status !== "CEKA_ODOBRENJE") throw new GreskaKorisniku("Dokument više ne čeka odobrenje.");
      if (odobri) await izvrsi(tx, akter, dok);
      await tx.skladisniDokument.update({ where: { id: dok.id }, data: { status: odobri ? "IZDAN" : "ODBIJEN" } });
    }
    const ime = await imeKorisnika(tx, akter.korisnikId);
    await tx.odobrenje.update({
      where: { id: o.id },
      data: { status: odobri ? "ODOBRENO" : "ODBIJENO", odlucioId: akter.korisnikId, odlucio: ime, razlog: r, odluceno: new Date() },
    });
    await zapisiDnevnik(tx, {
      firmaId: f,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: odobri ? "odobrenja.odobri" : "odobrenja.odbij",
      entitet: o.entitet,
      entitetId: o.entitetId,
      opis: `${odobri ? "Odobreno" : "Odbijeno"}: ${o.opis}${r ? ` — ${r}` : ""} (zatražio ${o.podnio})`,
      staro: { status: "CEKA" },
      novo: { status: odobri ? "ODOBRENO" : "ODBIJENO", razlog: r },
    });
  });
}
