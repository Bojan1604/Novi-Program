import { posaljiIzvjestaje } from "@/services/eracun";
import { automatskoIzdavanje } from "@/services/najam";
import { stvoriPonavljajuce } from "@/services/troskovi";
import { dostaviNaknadno } from "@/services/fiskalizacija";
import { dnevneKopije } from "@/services/kopije";
import { db } from "./db";

let pokrenuto = false;

/** Svake minute: naknadna dostava računa CIS-u; svakih sat vremena eIzvještavanje i dnevne sigurnosne kopije (poslije 02:00). Greška jednog kruga ne zaustavlja sljedeće. */
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
        await stvoriPonavljajuce(db, null);
        const a = await automatskoIzdavanje(db);
        if (a.greske.length) console.error("Automatsko izdavanje najma:", a.greske.join("; "));
        const k = await dnevneKopije(db);
        if (k.greske.length) console.error("Dnevne sigurnosne kopije:", k.greske.join("; "));
      }
    } catch (e) {
      console.error("Pozadinski posao:", e instanceof Error ? e.message : e);
    } finally {
      radi = false;
    }
  };
  setInterval(krug, 60_000).unref();
}
