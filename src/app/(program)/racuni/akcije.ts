"use server";

import { revalidatePath } from "next/cache";
import { procitajDatum } from "@/domain/datum";
import { procitajIznos } from "@/domain/novac";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { dodajUplatu, ponistiUplatu } from "@/services/uplate";

export async function uplataAkcija(dokumentId: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("uplate.unos", async (k): Promise<Odgovor> => {
    const d = procitajDatum(tekst(fd, "datum"));
    if (!d.ok) return { ok: false as const, greska: "Datum nije ispravan.", polja: { datum: "Npr. 25.09.2026." } };
    const i = procitajIznos(tekst(fd, "iznos"));
    if (!i.ok) return { ok: false as const, greska: i.greska, polja: { iznos: i.greska } };
    const povrat = fd.get("vrsta") === "povrat";
    const s = await dodajUplatu(db, k, dokumentId, {
      datum: d.vrijednost,
      iznos: povrat ? -i.vrijednost : i.vrijednost,
      nacin: tekst(fd, "nacin") || "T",
      opis: tekst(fd, "opis") || null,
    });
    revalidatePath(`/racuni/${dokumentId}`);
    revalidatePath("/racuni");
    return { ok: true as const, poruka: povrat ? "Povrat kupcu je upisan." : s.status === "PLACEN" ? "Račun je plaćen." : "Uplata je upisana." };
  });
}

export async function ponistiUplatuAkcija(dokumentId: string, uplataId: string, razlog: string) {
  return akcija("uplate.ponisti", async (k) => {
    await ponistiUplatu(db, k, uplataId, String(razlog ?? "").slice(0, 500));
    revalidatePath(`/racuni/${dokumentId}`);
    revalidatePath("/racuni");
    return { ok: true as const, poruka: "Uplata je poništena." };
  });
}
