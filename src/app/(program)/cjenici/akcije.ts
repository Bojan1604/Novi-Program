"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { procitajIznos } from "@/domain/novac";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { postaviCijenu, spremiCjenik } from "@/services/partneri";

export async function spremiCjenikAkcija(id: string | null, _p: Odgovor<{ id: string }> | undefined, fd: FormData) {
  const r = await akcija("cjenici.spremi", async (k) => {
    const popustTekst = tekst(fd, "popust").replace(/\s*%$/, "");
    const popust = popustTekst ? procitajIznos(popustTekst) : null;
    if (popust && !popust.ok)
      return { ok: false as const, greska: "Provjerite označena polja.", polja: { popust: popust.greska.replace("Iznos", "Popust") } };
    const noviId = await spremiCjenik(db, k, id, {
      naziv: tekst(fd, "naziv"),
      opis: tekst(fd, "opis") || null,
      popust: popust?.ok ? popust.vrijednost : null,
      aktivan: id === null || fd.get("aktivan") === "on",
    });
    revalidatePath("/cjenici");
    return { ok: true as const, poruka: "Spremljeno.", podaci: { id: noviId } };
  });
  if (r.ok && !id) redirect(`/cjenici/${r.podaci.id}`);
  return r;
}

export async function postaviCijenuAkcija(cjenikId: string, _p: Odgovor | undefined, fd: FormData) {
  return akcija("cjenici.stavka", async (k) => {
    const vrsta = tekst(fd, "vrsta");
    const artikl = tekst(fd, "artiklId");
    const ukloni = fd.get("ukloni") === "1";
    let cijena: number | null = null;
    if (!ukloni) {
      const c = procitajIznos(tekst(fd, "cijena"));
      if (!c.ok) return { ok: false as const, greska: c.greska, polja: { cijena: c.greska } };
      cijena = c.vrijednost;
    }
    await postaviCijenu(db, k, cjenikId, vrsta === "usluga" ? { uslugaId: artikl } : { modelId: artikl }, cijena);
    revalidatePath(`/cjenici/${cjenikId}`);
    return { ok: true as const, poruka: ukloni ? "Stavka je uklonjena." : "Cijena je spremljena." };
  });
}
