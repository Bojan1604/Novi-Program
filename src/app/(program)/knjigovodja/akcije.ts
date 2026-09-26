"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { oznaciPredaju, posaljiKnjigovodji } from "@/services/knjigovodja";

export async function oznaciPoslanoAkcija(mjesec: string): Promise<Odgovor> {
  return akcija("knjigovodja.predaja", async (k): Promise<Odgovor> => {
    await oznaciPredaju(db, k, String(mjesec), "RUCNO");
    revalidatePath("/knjigovodja");
    return { ok: true, poruka: "Označeno kao poslano." };
  });
}

export async function posaljiAkcija(mjesec: string, prima: string): Promise<Odgovor> {
  return akcija("knjigovodja.predaja", async (k): Promise<Odgovor> => {
    await posaljiKnjigovodji(db, k, String(mjesec), String(prima));
    revalidatePath("/knjigovodja");
    return { ok: true, poruka: `Poslano na ${prima}.` };
  });
}
