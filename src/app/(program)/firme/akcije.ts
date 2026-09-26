"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { novaFirma, odgovoriNaPoziv, prebaciFirmu } from "@/services/firme";

export async function prebaciAkcija(firmaId: string): Promise<Odgovor> {
  return akcija("firme.prebaci", async (k): Promise<Odgovor> => {
    const f = await prebaciFirmu(db, { sesijaId: k.sesija.sesijaId, korisnikId: k.korisnikId, ip: k.ip }, firmaId);
    revalidatePath("/", "layout");
    return { ok: true, poruka: `Radite u firmi ${f.naziv}.` };
  });
}

export async function novaFirmaAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("firme.nova", async (k): Promise<Odgovor> => {
    const f = await novaFirma(db, k, { naziv: String(fd.get("naziv") ?? ""), oib: String(fd.get("oib") ?? "") });
    await prebaciFirmu(db, { sesijaId: k.sesija.sesijaId, korisnikId: k.korisnikId, ip: k.ip }, f.id);
    revalidatePath("/", "layout");
    return { ok: true, poruka: "Firma je napravljena i sada radite u njoj. Podatke za dokumente upišite u Postavkama firme." };
  });
}

export async function odgovorAkcija(token: string, prihvati: boolean): Promise<Odgovor> {
  return akcija("firme.poziv-odgovor", async (k): Promise<Odgovor> => {
    await odgovoriNaPoziv(db, { id: k.korisnikId, email: k.sesija.korisnik.email }, token, prihvati, k.ip);
    revalidatePath("/", "layout");
    return { ok: true, poruka: prihvati ? "Poziv je prihvaćen — firma je na popisu." : "Poziv je odbijen." };
  });
}
