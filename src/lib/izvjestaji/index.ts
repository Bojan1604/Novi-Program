import { MARZE_PO_MJESECIMA, NAJAM_PO_UGOVORU, POTRAZIVANJA, SERVIS_PO_MJESECIMA, TROSKOVI_PO_KATEGORIJI, ZALIHA_PO_MODELU } from "./ostali";
import { PRIHOD_PO_KUPCU, PRIHOD_PO_MJESECIMA, PRIHOD_PO_MODELU } from "./prodaja";
import type { Izvjestaj } from "./tipovi";

/** Svi izvještaji (redoslijed = redoslijed na popisu). Novi izvještaj = unos ovdje; izvoz dolazi sam. */
export const IZVJESTAJI: Izvjestaj[] = [
  PRIHOD_PO_MJESECIMA,
  PRIHOD_PO_KUPCU,
  PRIHOD_PO_MODELU,
  POTRAZIVANJA,
  MARZE_PO_MJESECIMA,
  NAJAM_PO_UGOVORU,
  ZALIHA_PO_MODELU,
  TROSKOVI_PO_KATEGORIJI,
  SERVIS_PO_MJESECIMA,
];

export function izvjestaj(kljuc: string): Izvjestaj | undefined {
  return IZVJESTAJI.find((x) => x.kljuc === kljuc);
}
