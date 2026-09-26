"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { izdajDokument, odluciOZahtjevu } from "@/services/skladisni-dokumenti";

const id = z.string().max(40).nullable();
const SHEMA = z.object({
  vrsta: z.string().max(30),
  datum: z.string().max(10),
  skladisteIzId: id,
  skladisteUId: id,
  partnerId: id,
  razlog: z.string().trim().max(100).nullable(),
  napomena: z.string().trim().max(2000).nullable(),
  serijski: z.array(z.string().max(100)).max(5000),
});

export async function izdajDokumentAkcija(_p: Odgovor<{ id: string }> | undefined, fd: FormData) {
  const r = await akcija("skladisni.izdaj", async (k) => {
    let podaci: unknown;
    try {
      podaci = JSON.parse(String(fd.get("podaci") ?? ""));
    } catch {
      return { ok: false as const, greska: "Neispravni podaci obrasca." };
    }
    const p = SHEMA.safeParse(podaci);
    if (!p.success) return { ok: false as const, greska: "Neispravni podaci obrasca." };
    const d = await izdajDokument(db, k, { ...p.data, razlog: p.data.razlog || null, napomena: p.data.napomena || null });
    revalidatePath("/skladisni");
    revalidatePath("/uredaji");
    return { ok: true as const, poruka: d.broj, podaci: { id: d.id } };
  });
  if (r.ok) redirect(`/skladisni/${r.podaci.id}`);
  return r;
}

export async function odluciAkcija(odobrenjeId: string, _p: Odgovor | undefined, fd: FormData) {
  return akcija("odobrenja.odluci", async (k) => {
    const odobri = fd.get("odluka") === "odobri";
    await odluciOZahtjevu(db, k, odobrenjeId, odobri, String(fd.get("razlog") ?? "").slice(0, 500) || null);
    revalidatePath("/odobrenja");
    revalidatePath("/skladisni");
    return { ok: true as const, poruka: odobri ? "Odobreno i provedeno." : "Odbijeno." };
  });
}
