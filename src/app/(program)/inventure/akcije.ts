"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { procitajDatum } from "@/domain/datum";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { otvoriInventuru, skenirajUInventuru, ukloniIzInventure, zakljuciInventuru } from "@/services/inventure";

export async function otvoriInventuruAkcija(_p: Odgovor<{ id: string }> | undefined, fd: FormData) {
  const r = await akcija("inventure.uredi", async (k) => {
    const d = procitajDatum(tekst(fd, "datum"));
    if (!d.ok) return { ok: false as const, greska: "Datum nije ispravan (npr. 25.09.2026.)." };
    const inv = await otvoriInventuru(db, k, { skladisteId: tekst(fd, "skladisteId"), datum: d.vrijednost, napomena: tekst(fd, "napomena") || null });
    revalidatePath("/inventure");
    return { ok: true as const, podaci: { id: inv.id } };
  });
  if (r.ok) redirect(`/inventure/${r.podaci.id}`);
  return r;
}

export async function skenirajAkcija(id: string, serijski: string[]) {
  return akcija("inventure.uredi", async (k) => {
    const lista = Array.isArray(serijski) ? serijski.filter((s) => typeof s === "string").slice(0, 5000) : [];
    return { ok: true as const, podaci: await skenirajUInventuru(db, k, id, lista) };
  });
}

export async function ukloniAkcija(id: string, serijski: string) {
  return akcija("inventure.uredi", async (k) => {
    await ukloniIzInventure(db, k, id, String(serijski));
    revalidatePath(`/inventure/${id}`);
    return { ok: true as const };
  });
}

export async function zakljuciAkcija(id: string) {
  return akcija("inventure.uredi", async (k) => {
    await zakljuciInventuru(db, k, id);
    revalidatePath(`/inventure/${id}`);
    revalidatePath("/inventure");
    return { ok: true as const, poruka: "Inventura je zaključena." };
  });
}
