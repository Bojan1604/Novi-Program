import { PRIHOD_PO_KUPCU, PRIHOD_PO_MJESECIMA, PRIHOD_PO_MODELU } from "./prodaja";
import type { Izvjestaj } from "./tipovi";

/** Svi izvještaji (redoslijed = redoslijed na popisu). Novi izvještaj = unos ovdje; izvoz dolazi sam. */
export const IZVJESTAJI: Izvjestaj[] = [PRIHOD_PO_MJESECIMA, PRIHOD_PO_KUPCU, PRIHOD_PO_MODELU];

export function izvjestaj(kljuc: string): Izvjestaj | undefined {
  return IZVJESTAJI.find((x) => x.kljuc === kljuc);
}
