"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import type { NacinBrisanja } from "@/domain/opasna-zona";
import { obrisiPodatke, ocistiDnevnik } from "@/services/opasna-zona";

export async function obrisiAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("opasna.brisanje", async (k): Promise<Odgovor> => {
    const r = await obrisiPodatke(db, k, {
      nacin: String(fd.get("nacin") ?? "") as NacinBrisanja,
      lozinka: String(fd.get("lozinka") ?? ""),
      naziv: String(fd.get("naziv") ?? ""),
    });
    revalidatePath("/", "layout");
    return { ok: true, poruka: `Obrisano ${r.obrisano} zapisa. Kopija stanja prije brisanja je na stranici „Sigurnosne kopije“.` };
  });
}

export async function dnevnikAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("opasna.dnevnik", async (k): Promise<Odgovor> => {
    const r = await ocistiDnevnik(db, k, { mjeseci: Number(fd.get("mjeseci") ?? "0"), lozinka: String(fd.get("lozinka") ?? "") });
    revalidatePath("/opasna-zona");
    return { ok: true, poruka: `Obrisano ${r.obrisano} zapisa dnevnika.` };
  });
}
