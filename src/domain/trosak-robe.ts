/**
 * Trošak robe po narudžbenici (korak 4.1) — JEDNO pravilo, čista logika:
 *   trošak robe = veći od (vrijednost aktivnih primki, zbroj aktivnih ulaznih računa za robu);
 *   prijevoz i usluge (ulazni računi koji nisu za robu) uvijek su zaseban trošak.
 * Knjiženje nakon svake promjene = razlika prema već knjiženom (može biti i negativna, npr. nakon storna).
 */

export type PrimkaTroska = { id: string; iznos: number; aktivna: boolean };
export type RacunTroska = { id: string; iznos: number; zaRobu: boolean; aktivan: boolean };

export type TrosakNarudzbenice = {
  /** zbroj aktivnih primki (nabavna vrijednost bez PDV-a) */
  primke: number;
  /** zbroj aktivnih ulaznih računa označenih „račun za robu“ */
  racuniRobe: number;
  /** trošak robe = max(primke, računi za robu) */
  roba: number;
  /** prijevoz, usluge… (računi koji nisu za robu) */
  zasebno: number;
  ukupno: number;
  /** odakle je iznos robe (za objašnjenje u sučelju) */
  izvor: "PRIMKE" | "RACUNI" | "JEDNAKO" | "NEMA";
};

const zbroj = (l: number[]) => l.reduce((a, b) => a + b, 0);

export function trosakNarudzbenice(p: { primke: readonly PrimkaTroska[]; racuni: readonly RacunTroska[] }): TrosakNarudzbenice {
  for (const x of [...p.primke, ...p.racuni])
    if (!Number.isSafeInteger(x.iznos) || x.iznos < 0) throw new Error("Iznos mora biti cijeli broj centi (0 ili više).");
  const primke = zbroj(p.primke.filter((x) => x.aktivna).map((x) => x.iznos));
  const racuniRobe = zbroj(p.racuni.filter((x) => x.aktivan && x.zaRobu).map((x) => x.iznos));
  const zasebno = zbroj(p.racuni.filter((x) => x.aktivan && !x.zaRobu).map((x) => x.iznos));
  const roba = Math.max(primke, racuniRobe);
  const izvor = roba === 0 ? "NEMA" : primke === racuniRobe ? "JEDNAKO" : primke > racuniRobe ? "PRIMKE" : "RACUNI";
  return { primke, racuniRobe, roba, zasebno, ukupno: roba + zasebno, izvor };
}

/** Knjiženje usklađenja: koliko treba dodati (ili oduzeti) da knjiženo odgovara pravilu. */
export function uskladenje(
  knjizeno: { roba: number; zasebno: number },
  stanje: Pick<TrosakNarudzbenice, "roba" | "zasebno">,
): { roba: number; zasebno: number } {
  return { roba: stanje.roba - knjizeno.roba, zasebno: stanje.zasebno - knjizeno.zasebno };
}

/**
 * Ulazni eRačun za robu (4.4): pri prihvatu se knjiži samo razlika iznad već knjiženog troška robe (npr. iz primke).
 * Vraća iznos koji prihvat dodaje trošku robe (0 ako primke već pokrivaju račun).
 */
export function razlikaPrihvata(prije: { primke: readonly PrimkaTroska[]; racuni: readonly RacunTroska[] }, racun: RacunTroska): number {
  const a = trosakNarudzbenice(prije);
  const b = trosakNarudzbenice({ primke: prije.primke, racuni: [...prije.racuni.filter((r) => r.id !== racun.id), racun] });
  return b.roba - a.roba;
}
