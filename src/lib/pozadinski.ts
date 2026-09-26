import { posaljiIzvjestaje } from "@/services/eracun";
import { automatskoIzdavanje } from "@/services/najam";
import { dostaviNaknadno } from "@/services/fiskalizacija";
import { db } from "./db";

let pokrenuto = false;

/** Svake minute: naknadna dostava računa CIS-u; svakih sat vremena eIzvještavanje. Greška jednog kruga ne zaustavlja sljedeće. */
export function pokreniPozadinskePoslove() {
  if (pokrenuto) return;
  pokrenuto = true;
  let radi = false;
  let krugova = 0;
  const krug = async () => {
    if (radi) return;
    radi = true;
    try {
      await dostaviNaknadno(db);
      if (krugova++ % 60 === 0) {
        await posaljiIzvjestaje(db, null);
        const a = await automatskoIzdavanje(db);
        if (a.greske.length) console.error("Automatsko izdavanje najma:", a.greske.join("; "));
      }
    } catch (e) {
      console.error("Pozadinski posao:", e instanceof Error ? e.message : e);
    } finally {
      radi = false;
    }
  };
  setInterval(krug, 60_000).unref();
}
