/**
 * Motor naplate najma (korak 3.1) — čista logika, bez baze i ekrana.
 *
 * Pravila (MORA potvrditi vlasnik/knjigovođa):
 * - naplata po kalendarskim mjesecima; rata uređaja = mjesečna cijena × aktivni dani / dani u mjesecu
 *   (zaokruženo na cent, pola od nule); puni mjesec = točno mjesečna cijena
 * - aktivno od početka plana uređaja do povrata uređaja / kraja ugovora / otkaza (što je ranije), uključivo
 * - pauziran mjesec se ne naplaćuje; ručni iznos zamjenjuje izračun
 * - fakturirani mjesec je zaključan: vrijedi iznos s računa, promjene (cijena, kraj, povrat) ga ne diraju;
 *   ako je kasnija promjena smanjila iznos, razlika je „višak“ za odobrenje
 * - promjena cijene vrijedi od mjeseca, a smije krenuti tek od prve neizdane rate
 */

export type Mjesec = string; // "YYYY-MM"
export type DatumTekst = string; // "YYYY-MM-DD"

export type CijenaOd = { od: Mjesec; iznos: number };

export type PlanUredaja = {
  uredajId: string;
  /** početak naplate uređaja (dodan na ugovor) */
  od: DatumTekst;
  /** povrat uređaja; null = do kraja ugovora */
  do: DatumTekst | null;
  /** mjesečne cijene (centi) od mjeseca; prva vrijedi od početka */
  cijene: CijenaOd[];
  pauze: readonly Mjesec[];
  rucno: Readonly<Record<Mjesec, number>>;
};

export type UvjetiUgovora = { od: DatumTekst; do: DatumTekst | null; otkazan: DatumTekst | null };

/** ključ fakturirane rate: `${uredajId}|${mjesec}` → iznos s računa (centi) */
export type Fakturirano = ReadonlyMap<string, number>;
export const kljucRate = (uredajId: string, mjesec: Mjesec) => `${uredajId}|${mjesec}`;

export type IzvorRate = "PLAN" | "RUCNO" | "PAUZA" | "FAKTURIRANO";
export type Rata = { uredajId: string; mjesec: Mjesec; iznos: number; dana: number; danaUMjesecu: number; izvor: IzvorRate };

const RE_MJESEC = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Indeks fakturiranih mjeseci po ključu plana (jednom po mapi) — bez njega je 1.000 uređaja × 50.000 rata presporo. */
const indeksi = new WeakMap<Fakturirano, Map<string, Mjesec[]>>();
function fakturiraniMjeseci(f: Fakturirano, id: string): Mjesec[] {
  let i = indeksi.get(f);
  if (!i) {
    i = new Map();
    for (const k of f.keys()) {
      const p = k.lastIndexOf("|");
      const lista = i.get(k.slice(0, p)) ?? [];
      lista.push(k.slice(p + 1));
      i.set(k.slice(0, p), lista);
    }
    indeksi.set(f, i);
  }
  return i.get(id) ?? [];
}
export const jeMjesec = (m: unknown): m is Mjesec => typeof m === "string" && RE_MJESEC.test(m);

export function mjesecOd(d: DatumTekst): Mjesec {
  return d.slice(0, 7);
}

export function sljedeciMjesec(m: Mjesec, n = 1): Mjesec {
  const [g, mj] = m.split("-").map(Number) as [number, number];
  const ukupno = g * 12 + (mj - 1) + n;
  return `${Math.floor(ukupno / 12)}-${String((ukupno % 12) + 1).padStart(2, "0")}`;
}

export function daniUMjesecu(m: Mjesec): number {
  const [g, mj] = m.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(g, mj, 0)).getUTCDate();
}

/** Popis mjeseci od–do (uključivo). */
export function mjeseci(od: Mjesec, do_: Mjesec): Mjesec[] {
  const r: Mjesec[] = [];
  for (let m = od; m <= do_; m = sljedeciMjesec(m)) r.push(m);
  return r;
}

const najranije = (...d: (DatumTekst | null)[]) => d.filter((x): x is DatumTekst => !!x).sort()[0] ?? null;

/** Stvarni kraj naplate uređaja: povrat, kraj ugovora ili otkaz — što je ranije (null = otvoreno). */
export function krajNaplate(u: UvjetiUgovora, p: Pick<PlanUredaja, "do">): DatumTekst | null {
  return najranije(p.do, u.do, u.otkazan);
}

/** Početak: kasniji od početka ugovora i dodavanja uređaja. */
export function pocetakNaplate(u: UvjetiUgovora, p: Pick<PlanUredaja, "od">): DatumTekst {
  return [u.od, p.od].sort()[1]!;
}

/** Aktivni dani uređaja u mjesecu. */
export function aktivniDani(m: Mjesec, pocetak: DatumTekst, kraj: DatumTekst | null): number {
  const dm = daniUMjesecu(m);
  const prvi = `${m}-01`;
  const zadnji = `${m}-${String(dm).padStart(2, "0")}`;
  const a = pocetak > prvi ? pocetak : prvi;
  const b = kraj && kraj < zadnji ? kraj : zadnji;
  if (a > b) return 0;
  return Number(b.slice(8, 10)) - Number(a.slice(8, 10)) + 1;
}

/** Mjesečna cijena koja vrijedi u mjesecu (zadnja s `od` ≤ mjesec). */
export function cijenaUMjesecu(cijene: readonly CijenaOd[], m: Mjesec): number {
  let c: number | null = null;
  for (const x of [...cijene].sort((a, b) => a.od.localeCompare(b.od))) if (x.od <= m) c = x.iznos;
  return c ?? [...cijene].sort((a, b) => a.od.localeCompare(b.od))[0]?.iznos ?? 0;
}

/** cijena × dana / dana u mjesecu, zaokruženo pola od nule (cijeli brojevi — bez grešaka zaokruživanja). */
export function razmjerno(cijena: number, dana: number, danaUMjesecu: number): number {
  if (dana >= danaUMjesecu) return cijena;
  const b = BigInt(cijena) * BigInt(dana);
  const n = BigInt(danaUMjesecu);
  const neg = b < 0n;
  const a = neg ? -b : b;
  const q = (a * 2n + n) / (2n * n);
  return Number(neg ? -q : q);
}

/** Rate jednog uređaja od početka do zadanog mjeseca (uključivo). Mjeseci bez aktivnih dana se preskaču. */
export function rateUredaja(u: UvjetiUgovora, p: PlanUredaja, fakturirano: Fakturirano, doMjeseca: Mjesec): Rata[] {
  const pocetak = pocetakNaplate(u, p);
  const kraj = krajNaplate(u, p);
  const zadnji = kraj && mjesecOd(kraj) < doMjeseca ? mjesecOd(kraj) : doMjeseca;
  const pauze = new Set(p.pauze);
  const r: Rata[] = [];
  // fakturirani mjeseci ostaju i kad su nakon (novog) kraja — iznos s računa se ne mijenja
  const svi = new Set([
    ...(mjesecOd(pocetak) <= zadnji ? mjeseci(mjesecOd(pocetak), zadnji) : []),
    ...fakturiraniMjeseci(fakturirano, p.uredajId).filter((m) => m <= doMjeseca),
  ]);
  for (const m of [...svi].sort()) {
    const dm = daniUMjesecu(m);
    const dana = aktivniDani(m, pocetak, kraj);
    const f = fakturirano.get(kljucRate(p.uredajId, m));
    if (f !== undefined) {
      r.push({ uredajId: p.uredajId, mjesec: m, iznos: f, dana, danaUMjesecu: dm, izvor: "FAKTURIRANO" });
      continue;
    }
    if (dana === 0) continue;
    if (pauze.has(m)) r.push({ uredajId: p.uredajId, mjesec: m, iznos: 0, dana, danaUMjesecu: dm, izvor: "PAUZA" });
    else if (m in p.rucno) r.push({ uredajId: p.uredajId, mjesec: m, iznos: p.rucno[m]!, dana, danaUMjesecu: dm, izvor: "RUCNO" });
    else r.push({ uredajId: p.uredajId, mjesec: m, iznos: razmjerno(cijenaUMjesecu(p.cijene, m), dana, dm), dana, danaUMjesecu: dm, izvor: "PLAN" });
  }
  return r;
}

/** Rate svih uređaja ugovora do mjeseca. */
export function rateUgovora(u: UvjetiUgovora, planovi: readonly PlanUredaja[], fakturirano: Fakturirano, doMjeseca: Mjesec): Rata[] {
  return planovi.flatMap((p) => rateUredaja(u, p, fakturirano, doMjeseca));
}

/** Za izdati: nefakturirane rate s iznosom do mjeseca (uključivo), npr. zaostale i tekuća. */
export function zaIzdati(u: UvjetiUgovora, planovi: readonly PlanUredaja[], fakturirano: Fakturirano, doMjeseca: Mjesec): Rata[] {
  return rateUgovora(u, planovi, fakturirano, doMjeseca).filter((r) => r.izvor !== "FAKTURIRANO" && r.izvor !== "PAUZA" && r.iznos !== 0);
}

/**
 * Višak nakon povrata / otkaza / pauze: fakturirani mjeseci čiji bi iznos po sadašnjem planu bio manji.
 * Program ne mijenja račun — predlaže odobrenje za razliku.
 */
export function visak(
  u: UvjetiUgovora,
  p: PlanUredaja,
  fakturirano: Fakturirano,
): { mjesec: Mjesec; fakturirano: number; sada: number; razlika: number }[] {
  const pocetak = pocetakNaplate(u, p);
  const kraj = krajNaplate(u, p);
  const pauze = new Set(p.pauze);
  const r: { mjesec: Mjesec; fakturirano: number; sada: number; razlika: number }[] = [];
  for (const m of fakturiraniMjeseci(fakturirano, p.uredajId)) {
    const f = fakturirano.get(kljucRate(p.uredajId, m))!;
    const dm = daniUMjesecu(m);
    const dana = aktivniDani(m, pocetak, kraj);
    const sada = dana === 0 || pauze.has(m) ? 0 : m in p.rucno ? p.rucno[m]! : razmjerno(cijenaUMjesecu(p.cijene, m), dana, dm);
    if (sada < f) r.push({ mjesec: m, fakturirano: f, sada, razlika: f - sada });
  }
  return r.sort((a, b) => a.mjesec.localeCompare(b.mjesec));
}

/** Prva neizdana rata uređaja (od nje smije vrijediti nova cijena / sezona). */
export function prvaNeizdana(u: UvjetiUgovora, p: PlanUredaja, fakturirano: Fakturirano): Mjesec {
  let m = mjesecOd(pocetakNaplate(u, p));
  while (fakturirano.has(kljucRate(p.uredajId, m))) m = sljedeciMjesec(m);
  return m;
}

/** Nova cijena od mjeseca: greška ako bi dirala već izdanu ratu. */
export function provjeriPromjenuCijene(u: UvjetiUgovora, p: PlanUredaja, fakturirano: Fakturirano, od: Mjesec, iznos: number): string | null {
  if (!jeMjesec(od)) return "Mjesec nije ispravan.";
  if (!Number.isSafeInteger(iznos) || iznos < 0) return "Cijena mora biti nula ili više.";
  const prva = prvaNeizdana(u, p, fakturirano);
  if (od < prva) return `Cijena se može mijenjati od prve neizdane rate (${prva.slice(5)}/${prva.slice(0, 4)}).`;
  if (fakturiraniMjeseci(fakturirano, p.uredajId).some((m) => m >= od)) return "Nakon tog mjeseca već postoji izdana rata.";
  return null;
}

/** Pauza ili ručni iznos smiju se mijenjati samo na neizdanoj rati. */
export function provjeriIzmjenuMjeseca(p: PlanUredaja, fakturirano: Fakturirano, m: Mjesec): string | null {
  if (!jeMjesec(m)) return "Mjesec nije ispravan.";
  return fakturirano.has(kljucRate(p.uredajId, m)) ? "Rata za taj mjesec je izdana — promjena nije moguća (za razliku izdajte odobrenje)." : null;
}
