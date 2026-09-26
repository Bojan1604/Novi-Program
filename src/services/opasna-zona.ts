import { DNEVNIK_NAJMANJE_MJESECI, NACINI_BRISANJA, type NacinBrisanja } from "@/domain/opasna-zona";
import { imaPosebno, imaPravo } from "@/domain/prava";
import type { PrismaClient } from "@/generated/prisma/client";
import { GreskaKorisniku } from "@/lib/greske";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { zapisiDnevnik } from "./dnevnik";
import { katalog, redoslijedUpisa, sadrzajUTransakciji, spremiKopiju, type TablicaKataloga } from "./kopije";
import type { Akter } from "./korisnici";
import { potvrdiLozinku } from "./prijava";
import { napraviZadaneSifrarnike } from "./sifrarnici";

/**
 * Opasna zona (korak 6.7): brisanje podataka firme i čišćenje dnevnika.
 * Traži pravo „Opasna zona“, lozinku i prepisan naziv firme; prije brisanja se sama izradi
 * sigurnosna kopija. Briše se SAMO unutar firme — druge firme se ne diraju.
 */

/** Uvijek ostaje: uloge (i članstva, sesije, kopije — nisu u katalogu kopije) i dnevnik. */
export const UVIJEK_OSTAJE = new Set(["Uloga", "Dnevnik"]);
/** Matični podaci: ostaju kod brisanja prometa. */
export const MATICNI = new Set([
  "Kategorija",
  "Proizvodjac",
  "ModelUredaja",
  "Skladiste",
  "StanjeRobe",
  "Usluga",
  "Partner",
  "Poslovnica",
  "Cjenik",
  "StavkaCjenika",
  "KategorijaTroska",
  "PonavljajuciTrosak",
  "LogoFirme",
  "KorisnikPortala",
  "MdmOrganizacija",
  "MdmProfil",
  "MdmAplikacija",
  "MdmDatoteka",
  "MdmDodjela",
  "MdmUredaj",
]);
/** Promet: briše se kod oba načina. Prilog se briše po vrsti zapisa kojem pripada. Test pukne za tablicu koja nije ni u jednom popisu. */
export const PROMET = new Set([
  "Brojac",
  "CijenaNajma",
  "DogadajServisa",
  "DogadajUredaja",
  "EIzvjestaj",
  "ERacun",
  "Inventura",
  "MdmNaredba",
  "MdmSnimka",
  "MdmZapis",
  "MjesecNajma",
  "Narudzbenica",
  "Odobrenje",
  "PlacanjeUlaznog",
  "PredajaKnjigovodji",
  "Primka",
  "ProdajniDokument",
  "RataNajma",
  "ServisniNalog",
  "SkladisniDokument",
  "SlanjeEposte",
  "StavkaInventure",
  "StavkaNarudzbenice",
  "StavkaProdajnogDokumenta",
  "StavkaSkladisnogDokumenta",
  "Trosak",
  "UgovorNajma",
  "UlazniRacun",
  "Uplata",
  "Uredaj",
  "UredajNaStavci",
  "UredajNaUgovoru",
]);

const q = (ime: string) => `"${ime.replaceAll('"', '""')}"`;

async function provjeriPotvrdu(db: PrismaClient, akter: Akter, potvrda: { lozinka: string; naziv?: string }) {
  if (!imaPosebno(akter.prava, "opasnaZona") || !imaPravo(akter.prava, "postavke", "puno")) throw new GreskaKorisniku("Nemate pravo na opasnu zonu.");
  const f = await db.firma.findUniqueOrThrow({ where: { id: akter.firmaId }, select: { naziv: true, fiskalNacin: true } });
  await potvrdiLozinku(db, akter.korisnikId, potvrda.lozinka, akter.ip ?? null);
  if (potvrda.naziv !== undefined && potvrda.naziv.trim() !== f.naziv) throw new GreskaKorisniku("Prepisani naziv firme ne odgovara.");
  return f;
}

/** Podjela tablica za način brisanja (iz kataloga — nova tablica bez odluke ruši brisanje). */
export function podjelaBrisanja(tablice: TablicaKataloga[], nacin: NacinBrisanja): { brisu: Set<string>; ostaju: Set<string> } {
  const brisu = new Set<string>();
  const ostaju = new Set<string>();
  for (const t of tablice) {
    if (t.ime === "Prilog") continue;
    const poznata = UVIJEK_OSTAJE.has(t.ime) || MATICNI.has(t.ime) || PROMET.has(t.ime);
    if (!poznata) throw new Error(`Opasna zona: tablica ${t.ime} nije razvrstana (UVIJEK_OSTAJE, MATICNI ili PROMET).`);
    if (PROMET.has(t.ime) || (nacin === "SVE" && MATICNI.has(t.ime))) brisu.add(t.ime);
    else ostaju.add(t.ime);
  }
  return { brisu, ostaju };
}

/**
 * Brisanje podataka firme. Prije brisanja izrađuje sigurnosnu kopiju (ostaje na stranici
 * „Sigurnosne kopije“). Fiskalizirani računi u produkciji se ne smiju brisati (čuvanje 11 godina).
 */
export async function obrisiPodatke(
  db: PrismaClient,
  akter: Akter,
  ulaz: { nacin: NacinBrisanja; lozinka: string; naziv: string },
): Promise<{ obrisano: number; kopijaId: string }> {
  if (!(ulaz.nacin in NACINI_BRISANJA)) throw new GreskaKorisniku("Odaberite što se briše.");
  const firma = await provjeriPotvrdu(db, akter, ulaz);
  const f = akter.firmaId;
  // kopija i brisanje u istom stanju baze (REPEATABLE READ): sve što se briše je u kopiji; zapis koji
  // netko doda u međuvremenu nije ni u kopiji ni obrisan (ili brisanje padne na vezi pa se ponovi)
  return db.$transaction(
    async (tx) => {
      await zakljucajKljuc(tx, `opasna-zona:${f}`);
      // bez obzira na današnji način: dokumenti izdani u produkciji (fiskalizirani ili još na putu do CIS-a);
      // stari dokumenti bez zapisanog načina računaju se kao produkcijski ako je firma sada u produkciji
      const produkcijski = await tx.prodajniDokument.count({
        where: {
          firmaId: f,
          OR: [
            { fiskalNacin: "PRODUKCIJA", OR: [{ jir: { not: null } }, { fiskalStatus: { in: ["CEKA", "FISKALIZIRAN"] } }] },
            ...(firma.fiskalNacin === "PRODUKCIJA" ? [{ fiskalNacin: null, OR: [{ jir: { not: null } }, { fiskalStatus: "CEKA" }] }] : []),
          ],
        },
      });
      if (produkcijski > 0)
        throw new GreskaKorisniku(
          "Firma ima račune fiskalizirane u produkciji — zakon traži njihovo čuvanje 11 godina, pa se promet ne može obrisati.",
        );
      const kopija = await spremiKopiju(tx, f, "RUCNA", akter, await sadrzajUTransakciji(tx, f));
      const tablice = await katalog(tx);
      const { brisu } = podjelaBrisanja(tablice, ulaz.nacin);
      const red = redoslijedUpisa(tablice);

      // veze koje bi spriječile brisanje: prazne se (krug među brisanima, preostali zapis → obrisani)
      for (const { tablica: t, naknadno } of red) {
        const prazni = new Set<string>();
        if (brisu.has(t.ime)) for (const s of naknadno) prazni.add(s);
        else
          for (const v of t.veze) {
            if (!brisu.has(v.cilj)) continue;
            const stupci = v.stupci.filter((s) => s !== "firmaId" && t.nullable.has(s));
            if (!stupci.length) throw new Error(`Opasna zona: ${t.ime} ostaje, a obavezno pokazuje na ${v.cilj} koji se briše.`);
            for (const s of stupci) prazni.add(s);
          }
        if (prazni.size)
          await tx.$executeRawUnsafe(
            `UPDATE ${q(t.ime)} SET ${[...prazni].map((s) => `${q(s)} = NULL`).join(", ")} WHERE "firmaId" = $1::uuid AND (${[...prazni].map((s) => `${q(s)} IS NOT NULL`).join(" OR ")})`,
            f,
          );
      }

      let obrisano = await tx.prilog
        .deleteMany({ where: { firmaId: f, ...(ulaz.nacin === "SVE" ? {} : { entitet: { in: [...brisu] } }) } })
        .then((r) => r.count);
      for (const { tablica: t } of [...red].reverse()) {
        if (!brisu.has(t.ime)) continue;
        obrisano += await tx.$executeRawUnsafe(`DELETE FROM ${q(t.ime)} WHERE "firmaId" = $1::uuid`, f);
      }
      if (ulaz.nacin === "SVE") {
        await tx.firma.update({ where: { id: f }, data: { logoId: null } });
        await napraviZadaneSifrarnike(tx, f);
      }
      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        radnja: "opasna.brisanje",
        entitet: "Firma",
        entitetId: f,
        opis: `Obrisano ${ulaz.nacin === "SVE" ? "sve podatke firme" : "promet"}: ${obrisano} zapisa (prije brisanja izrađena sigurnosna kopija)`,
        ip: akter.ip ?? null,
      });
      return { obrisano, kopijaId: kopija.id };
    },
    { isolationLevel: "RepeatableRead", timeout: 30 * 60_000, maxWait: 60_000 },
  );
}

/** Čišćenje dnevnika: brišu se zapisi stariji od zadanog broja mjeseci (najmanje 12). Samo čišćenje ostaje zapisano. */
export async function ocistiDnevnik(
  db: PrismaClient,
  akter: Akter,
  ulaz: { mjeseci: number; lozinka: string },
  sada = new Date(),
): Promise<{ obrisano: number }> {
  const mjeseci = Math.floor(ulaz.mjeseci);
  if (!Number.isFinite(mjeseci) || mjeseci < DNEVNIK_NAJMANJE_MJESECI || mjeseci > 1200)
    throw new GreskaKorisniku(`Dnevnik se može čistiti samo za zapise starije od najmanje ${DNEVNIK_NAJMANJE_MJESECI} mjeseci.`);
  await provjeriPotvrdu(db, akter, { lozinka: ulaz.lozinka });
  const granica = new Date(sada);
  granica.setUTCMonth(granica.getUTCMonth() - mjeseci);
  return db.$transaction(async (tx) => {
    const { count } = await tx.dnevnik.deleteMany({ where: { firmaId: akter.firmaId, vrijeme: { lt: granica } } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      radnja: "opasna.dnevnik",
      entitet: "Dnevnik",
      opis: `Očišćen dnevnik: ${count} zapisa starijih od ${mjeseci} mjeseci (prije ${granica.toISOString().slice(0, 10)})`,
      ip: akter.ip ?? null,
    });
    return { obrisano: count };
  });
}

/** Podaci za stranicu opasne zone. */
export async function stanjeOdrzavanja(db: PrismaClient, firmaId: string) {
  const [dnevnik, najstariji, velicina] = await Promise.all([
    db.dnevnik.count({ where: { firmaId } }),
    db.dnevnik.findFirst({ where: { firmaId }, orderBy: { vrijeme: "asc" }, select: { vrijeme: true } }),
    db.$queryRaw<{ v: bigint }[]>`SELECT pg_database_size(current_database()) AS v`,
  ]);
  return { dnevnik, najstariji: najstariji?.vrijeme ?? null, velicinaBaze: Number(velicina[0]?.v ?? 0) };
}

/** Svakih sat vremena: istekle sesije, prijave u dva koraka i stari pokušaji prijave (sve firme). */
export async function odrzavanje(db: PrismaClient, sada = new Date()): Promise<number> {
  const dan = new Date(sada.getTime() - 24 * 3600_000);
  const mjesec = new Date(sada.getTime() - 30 * 24 * 3600_000);
  const r = await Promise.all([
    db.sesija.deleteMany({ where: { istjece: { lt: dan } } }),
    db.sesijaPortala.deleteMany({ where: { istjece: { lt: dan } } }),
    db.prijavaDrugiKorak.deleteMany({ where: { istjece: { lt: dan } } }),
    db.pokusajPrijave.deleteMany({ where: { vrijeme: { lt: mjesec } } }),
  ]);
  return r.reduce((s, x) => s + x.count, 0);
}
