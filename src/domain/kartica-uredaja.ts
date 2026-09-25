/**
 * Kartica uređaja — čista pravila: koja se polja smiju ručno ispraviti i smije li se uređaj obrisati.
 *
 * Serijski broj i model određuju uređaj na dokumentima. Čim je uređaj na ijednom dokumentu osim
 * vlastite primke (račun, ugovor, servisni nalog, međuskladišnica…), ta dva polja se zaključavaju —
 * ispravak ne smije pokvariti vezu s računom. Ostali podaci (specifikacija, napomena, jamstvo) uvijek se smiju ispraviti.
 */

/** Polja koja se uvijek smiju ispraviti (uz pravo „operativno“ na uređajima). */
export const SLOBODNA_POLJA = ["cpu", "ram", "disk", "ekran", "os", "napomena", "jamstvoDo", "stanjeRobeId"] as const;
/** Polja koja određuju uređaj na dokumentima. */
export const POLJA_IDENTITETA = ["serijski", "modelId"] as const;
/** Nabavna cijena — samo uz pravo „costs“. */
export const POLJE_NABAVNE = "nabavnaCijena" as const;

export type PoljeIspravka = (typeof SLOBODNA_POLJA)[number] | (typeof POLJA_IDENTITETA)[number] | typeof POLJE_NABAVNE;

/** Vrste dokumenata iz povijesti koje NE vežu uređaj (vlastita primka ga samo stvara). */
const NE_VEZU = new Set(["Primka"]);

export type VezeUredaja = {
  /** primka kojom je zaprimljen (null = unesen drugim putem) */
  primka: string | null;
  /** vrste i brojevi dokumenata iz povijesti (dokumentVrsta, dokumentBroj) */
  dokumenti: readonly { vrsta: string; broj: string | null }[];
};

/** Dokumenti koji vežu serijski i model (sve osim vlastite primke), bez ponavljanja. */
export function vezniDokumenti(veze: VezeUredaja): string[] {
  const r = new Set<string>();
  for (const d of veze.dokumenti) if (!NE_VEZU.has(d.vrsta)) r.add(d.broj ? `${d.vrsta} ${d.broj}` : d.vrsta);
  return [...r];
}

/** Koja polja korisnik smije ispraviti i zašto su ostala zaključana. */
export function dopustenaPolja(veze: VezeUredaja, vidiNabavne: boolean): { polja: Set<PoljeIspravka>; zakljucano: string | null } {
  const polja = new Set<PoljeIspravka>(SLOBODNA_POLJA);
  if (vidiNabavne) polja.add(POLJE_NABAVNE);
  const vezni = vezniDokumenti(veze);
  if (vezni.length === 0) {
    for (const p of POLJA_IDENTITETA) polja.add(p);
    return { polja, zakljucano: null };
  }
  return {
    polja,
    zakljucano: `Serijski broj i model ne mogu se mijenjati jer je uređaj na dokumentima: ${vezni.slice(0, 5).join(", ")}${vezni.length > 5 ? " …" : ""}.`,
  };
}

/**
 * Brisanje samo bez veza: uređaj ne smije biti ni na primci ni na ijednom dokumentu.
 * Uređaj s primke uklanja se stornom primke (koja pazi na sve uređaje zajedno).
 */
export function mozeSeObrisati(veze: VezeUredaja): { ok: true } | { ok: false; razlog: string } {
  if (veze.primka) return { ok: false, razlog: `Uređaj je zaprimljen primkom ${veze.primka} — uklanja se stornom primke.` };
  const vezni = vezniDokumenti(veze);
  if (vezni.length) return { ok: false, razlog: `Uređaj je na dokumentima (${vezni.slice(0, 5).join(", ")}) i ne može se obrisati.` };
  return { ok: true };
}

/** Koja su se polja stvarno promijenila (za provjeru i dnevnik). Prazne vrijednosti = null. */
export function promijenjenaPolja(
  staro: Partial<Record<PoljeIspravka, string | null>>,
  novo: Partial<Record<PoljeIspravka, string | null>>,
): PoljeIspravka[] {
  const r: PoljeIspravka[] = [];
  for (const k of Object.keys(novo) as PoljeIspravka[]) {
    const a = staro[k] ?? null;
    const b = novo[k] ?? null;
    if ((a === "" ? null : a) !== (b === "" ? null : b)) r.push(k);
  }
  return r;
}
