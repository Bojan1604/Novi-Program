"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { VrstaOrganizacije } from "@/domain/mdm";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { noviKodUpisa, postaviStanjeMdmUredaja, spremiOrganizaciju } from "@/services/mdm";

export async function spremiOrganizacijuAkcija(id: string | null, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  const r = await akcija("mdm.organizacije", async (k) => {
    const oid = await spremiOrganizaciju(db, k, id, {
      naziv: tekst(fd, "naziv"),
      vrsta: tekst(fd, "vrsta") as VrstaOrganizacije,
      nadredenaId: tekst(fd, "nadredenaId") || null,
      partnerId: tekst(fd, "partnerId") || null,
      aktivna: id ? fd.get("aktivna") === "on" : true,
    });
    revalidatePath("/mdm");
    revalidatePath(`/mdm/${oid}`);
    return { ok: true as const, podaci: oid };
  });
  if (r.ok && !id) redirect(`/mdm/${r.podaci}`);
  return r.ok ? { ok: true, poruka: "Spremljeno." } : r;
}

export async function noviKodAkcija(id: string): Promise<Odgovor> {
  return akcija("mdm.organizacije", async (k): Promise<Odgovor> => {
    await noviKodUpisa(db, k, String(id));
    revalidatePath(`/mdm/${id}`);
    return { ok: true, poruka: "Novi kod upisa (stari više ne vrijedi)." };
  });
}

export async function stanjeUredajaAkcija(id: string, blokiraj: boolean): Promise<Odgovor> {
  return akcija("mdm.uredaji", async (k): Promise<Odgovor> => {
    await postaviStanjeMdmUredaja(db, k, String(id), blokiraj === true ? "BLOKIRAN" : "AKTIVAN");
    revalidatePath(`/mdm/uredaji/${id}`);
    return { ok: true, poruka: blokiraj ? "Uređaj je blokiran." : "Uređaj je ponovno aktivan." };
  });
}
