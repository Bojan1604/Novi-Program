/**
 * Nabava (korak 4.2): PDV prema državi dobavljača i provjera zaprimanja po narudžbenici — čista logika.
 * Pravila PDV-a MORA potvrditi knjigovođa.
 */
import type { PdvStatus } from "./partner";

export const PDV_REZIMI = {
  HR: "Domaći dobavljač — PDV 25 % (pretporez)",
  EU: "Dobavljač iz EU — prijenos porezne obveze (obračunava se PDV i pretporez)",
  UVOZ: "Uvoz izvan EU — PDV se plaća pri uvozu (carina)",
  BEZ_PDV: "Dobavljač nije u sustavu PDV-a",
} as const;
export type PdvRezim = keyof typeof PDV_REZIMI;

/** Režim PDV-a nabave iz poreznog statusa dobavljača. */
export function pdvRezimNabave(status: PdvStatus, dobavljacUSustavuPdv = true): PdvRezim {
  if (status === "EU_OBVEZNIK") return "EU";
  if (status === "TRECA_ZEMLJA") return "UVOZ";
  if (status === "EU_NEOBVEZNIK") return "HR";
  return dobavljacUSustavuPdv ? "HR" : "BEZ_PDV";
}

/**
 * Iznosi nabave: `naPlatiti` je ono što se plaća dobavljaču, `pretporez` ono što firma odbija.
 * Prijenos obveze (EU): dobavljač ne naplaćuje PDV, firma ga sama obračunava i odbija (neto 0).
 */
export function pdvNabave(
  rezim: PdvRezim,
  osnovica: number,
  stopa = 2500,
): { pdv: number; naPlatiti: number; pretporez: number; samooporezivanje: number } {
  const pdv = Math.round((osnovica * stopa) / 10000);
  switch (rezim) {
    case "HR":
      return { pdv, naPlatiti: osnovica + pdv, pretporez: pdv, samooporezivanje: 0 };
    case "EU":
      return { pdv: 0, naPlatiti: osnovica, pretporez: pdv, samooporezivanje: pdv };
    case "UVOZ":
      return { pdv: 0, naPlatiti: osnovica, pretporez: 0, samooporezivanje: 0 };
    case "BEZ_PDV":
      return { pdv: 0, naPlatiti: osnovica, pretporez: 0, samooporezivanje: 0 };
  }
}

export type StavkaNarudzbe = { id: string; kolicina: number; zaprimljeno: number };

/** Zaprimanje po narudžbenici: ne više od naručenog po stavci (djelomično je dopušteno). */
export function provjeriZaprimanje(stavke: readonly StavkaNarudzbe[], zaprimiti: ReadonlyMap<string, number>): string | null {
  for (const [id, n] of zaprimiti) {
    const s = stavke.find((x) => x.id === id);
    if (!s) return "Stavka nije na narudžbenici.";
    if (!Number.isInteger(n) || n < 0) return "Količina nije ispravna.";
    if (s.zaprimljeno + n > s.kolicina)
      return `Zaprima se više nego što je naručeno (naručeno ${s.kolicina}, već zaprimljeno ${s.zaprimljeno}, sada ${n}).`;
  }
  if ([...zaprimiti.values()].every((n) => n === 0)) return "Upišite barem jedan uređaj.";
  return null;
}

export const STATUSI_NARUDZBE = {
  OTVORENA: "Otvorena",
  DJELOMICNO: "Djelomično zaprimljena",
  ZAPRIMLJENA: "Zaprimljena",
  ZATVORENA: "Zatvorena",
  STORNIRANA: "Stornirana",
} as const;
export type StatusNarudzbe = keyof typeof STATUSI_NARUDZBE;

/** Status iz količina (ručno zatvorena / stornirana ostaje). */
export function statusNarudzbe(trenutni: string, stavke: readonly { kolicina: number; zaprimljeno: number }[]): StatusNarudzbe {
  if (trenutni === "ZATVORENA" || trenutni === "STORNIRANA") return trenutni;
  const z = stavke.reduce((a, s) => a + s.zaprimljeno, 0);
  if (z === 0) return "OTVORENA";
  return stavke.every((s) => s.zaprimljeno >= s.kolicina) ? "ZAPRIMLJENA" : "DJELOMICNO";
}
