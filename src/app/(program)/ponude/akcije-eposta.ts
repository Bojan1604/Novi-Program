"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import { posaljiDokument, zabiljeziMailto, type Poruka } from "@/services/eposta";

const cista = (p: Poruka): Poruka => ({ vrsta: String(p.vrsta), prima: String(p.prima), predmet: String(p.predmet), tijelo: String(p.tijelo) });

export async function posaljiEpostomAkcija(dokumentId: string, p: Poruka) {
  return akcija("eposta.slanje", async (k) => {
    const r = await posaljiDokument(db, k, dokumentId, cista(p));
    revalidatePath(`/racuni/${dokumentId}`);
    revalidatePath(`/ponude/${dokumentId}`);
    return r.poslano ? { ok: true as const, poruka: "Poslano." } : { ok: false as const, greska: `Slanje nije uspjelo: ${r.greska}` };
  });
}

export async function zabiljeziMailtoAkcija(dokumentId: string, p: Poruka) {
  return akcija("eposta.slanje", async (k) => {
    await zabiljeziMailto(db, k, dokumentId, cista(p));
    revalidatePath(`/racuni/${dokumentId}`);
    revalidatePath(`/ponude/${dokumentId}`);
    return { ok: true as const };
  });
}
