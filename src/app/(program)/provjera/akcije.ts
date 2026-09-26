"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { popraviDosljednost } from "@/services/dosljednost";

export async function popraviAkcija(): Promise<Odgovor> {
  return akcija("dosljednost.popravi", async (k): Promise<Odgovor> => {
    const n = await popraviDosljednost(db, k);
    revalidatePath("/provjera");
    return { ok: true, poruka: n ? `Popravljeno: ${n}. Svaki popravak je u dnevniku.` : "Nema ništa za popraviti." };
  });
}
