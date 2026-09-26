"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { izradiKopiju } from "@/services/kopije";

export async function izradiAkcija(): Promise<Odgovor> {
  return akcija("kopije.izradi", async (k): Promise<Odgovor> => {
    const r = await izradiKopiju(db, k.firmaId, "RUCNA", k);
    revalidatePath("/kopije");
    return { ok: true, poruka: `Kopija je izrađena (${Math.max(1, Math.round(r.velicina / 1024))} KB).` };
  });
}
