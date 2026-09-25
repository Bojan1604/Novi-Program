"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { pravaIzObrasca, tekst } from "@/lib/obrazac";
import { obrisiUlogu, spremiUlogu } from "@/services/korisnici";

export async function spremiUloguAkcija(id: string | null, _p: Odgovor<{ id: string }> | undefined, fd: FormData) {
  const r = await akcija("uloge.spremi", async (k) => {
    const noviId = await spremiUlogu(db, k, { id: id ?? undefined, naziv: tekst(fd, "naziv"), opis: tekst(fd, "opis"), prava: pravaIzObrasca(fd) });
    revalidatePath("/uloge");
    return { ok: true as const, poruka: "Uloga je spremljena.", podaci: { id: noviId } };
  });
  if (r.ok && !id) redirect(`/uloge/${r.podaci.id}`);
  return r;
}

export async function obrisiUloguAkcija(id: string, _p: Odgovor | undefined) {
  const r = await akcija("uloge.obrisi", async (k) => {
    await obrisiUlogu(db, k, id);
    revalidatePath("/uloge");
    return { ok: true as const };
  });
  if (r.ok) redirect("/uloge");
  return r;
}
