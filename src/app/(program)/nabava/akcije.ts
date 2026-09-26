"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { spremiNarudzbenicu, zaprimiPoNarudzbenici, zatvoriNarudzbenicu } from "@/services/nabava";

const NARUDZBA = z.object({
  datum: z.string().max(10),
  dobavljacId: z.string().max(40),
  napomena: z.string().max(2000).nullable(),
  verzija: z.number().int(),
  stavke: z.array(z.object({ modelId: z.string().max(40), kolicina: z.number().int(), cijena: z.number().int() })).max(500),
});

export async function spremiNarudzbenicuAkcija(id: string | null, podaci: unknown): Promise<Odgovor> {
  const p = NARUDZBA.safeParse(podaci);
  if (!p.success) return { ok: false, greska: "Neispravni podaci obrasca." };
  const r = await akcija("nabava.narudzbenica", async (k) => {
    const n = await spremiNarudzbenicu(db, k, id, p.data);
    revalidatePath("/nabava");
    revalidatePath(`/nabava/${n.id}`);
    return { ok: true as const, podaci: n };
  });
  if (r.ok && !id) redirect(`/nabava/${r.podaci.id}`);
  return r.ok ? { ok: true, poruka: "Spremljeno." } : r;
}

const ZAPRIMANJE = z.object({
  datum: z.string().max(10),
  skladisteId: z.string().max(40),
  dokumentDobavljaca: z.string().max(200).nullable(),
  knjiziUTroskove: z.boolean(),
  stavke: z.array(z.object({ stavkaId: z.string().max(40), serijski: z.array(z.string().max(100)).max(5000) })).max(500),
});

export async function zaprimiAkcija(narudzbenicaId: string, podaci: unknown): Promise<Odgovor> {
  const p = ZAPRIMANJE.safeParse(podaci);
  if (!p.success) return { ok: false, greska: "Neispravni podaci obrasca." };
  return akcija("nabava.zaprimi", async (k): Promise<Odgovor> => {
    const r = await zaprimiPoNarudzbenici(db, k, String(narudzbenicaId), p.data);
    revalidatePath(`/nabava/${narudzbenicaId}`);
    revalidatePath("/primke");
    revalidatePath("/uredaji");
    return { ok: true, poruka: `Zaprimljeno primkom ${r.broj}.` };
  });
}

export async function statusNarudzbeniceAkcija(id: string, radnja: "ZATVORI" | "STORNO" | "OTVORI"): Promise<Odgovor> {
  return akcija("nabava.status", async (k): Promise<Odgovor> => {
    await zatvoriNarudzbenicu(db, k, String(id), radnja === "STORNO" ? "STORNO" : radnja === "OTVORI" ? "OTVORI" : "ZATVORI");
    revalidatePath(`/nabava/${id}`);
    revalidatePath("/nabava");
    return { ok: true, poruka: "Spremljeno." };
  });
}
