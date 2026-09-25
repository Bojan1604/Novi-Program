"use server";

import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { promijeniVlastituLozinku } from "@/services/korisnici";

export async function promijeniLozinkuAkcija(_p: Odgovor | undefined, fd: FormData) {
  return akcija("racun.lozinka", async (k) => {
    const nova = String(fd.get("nova") ?? "");
    if (nova !== String(fd.get("ponovljena") ?? "")) return { ok: false as const, greska: "Nove lozinke se ne podudaraju." };
    await promijeniVlastituLozinku(db, { ...k, sesijaId: k.sesija.sesijaId }, String(fd.get("trenutna") ?? ""), nova);
    return { ok: true as const, poruka: "Lozinka je promijenjena. Ostali uređaji su odjavljeni." };
  });
}
