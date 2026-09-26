"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import { osvjeziStatusERacuna, posaljiERacun, posaljiIzvjestaje, STATUSI_ERACUNA } from "@/services/eracun";

export async function posaljiERacunAkcija(dokumentId: string) {
  return akcija("eracun.posalji", async (k) => {
    const r = await posaljiERacun(db, k, String(dokumentId));
    revalidatePath(`/racuni/${dokumentId}`);
    revalidatePath("/eracuni");
    return { ok: true as const, poruka: `eRačun je poslan (${STATUSI_ERACUNA[r.status].toLowerCase()}).` };
  });
}

export async function statusERacunaAkcija(dokumentId: string) {
  return akcija("eracun.posalji", async (k) => {
    const s = await osvjeziStatusERacuna(db, k, String(dokumentId));
    revalidatePath(`/racuni/${dokumentId}`);
    revalidatePath("/eracuni");
    return { ok: true as const, poruka: `Status: ${STATUSI_ERACUNA[s]}.` };
  });
}

export async function posaljiIzvjestajeAkcija() {
  return akcija("eracun.izvjestaji", async (k) => {
    const r = await posaljiIzvjestaje(db, k.firmaId);
    revalidatePath("/eracuni");
    return r.greske
      ? { ok: false as const, greska: `Poslano ${r.poslano}, neuspjelo ${r.greske} — pokušat će se ponovno.` }
      : { ok: true as const, poruka: `Poslano izvještaja: ${r.poslano}.` };
  });
}
