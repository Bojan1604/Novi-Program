import { dostaviNaknadno } from "@/services/fiskalizacija";
import { db } from "./db";

let pokrenuto = false;

/** Svake minute: naknadna dostava računa CIS-u. Greška jednog kruga ne zaustavlja sljedeće. */
export function pokreniPozadinskePoslove() {
  if (pokrenuto) return;
  pokrenuto = true;
  let radi = false;
  const krug = async () => {
    if (radi) return;
    radi = true;
    try {
      await dostaviNaknadno(db);
    } catch (e) {
      console.error("Naknadna dostava fiskalizacije:", e instanceof Error ? e.message : e);
    } finally {
      radi = false;
    }
  };
  setInterval(krug, 60_000).unref();
}
