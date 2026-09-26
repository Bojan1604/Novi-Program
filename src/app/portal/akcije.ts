"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { akcijaPortala, obrisiKolacicPortala, postaviKolacicPortala, tokenPortala } from "@/lib/portal";
import { podaciZahtjeva } from "@/lib/sesija";
import { odjaviPortal, prijaviPortal } from "@/services/portal";

export type StanjePrijavePortala = { greska?: string; email?: string } | undefined;

// javna akcija: prijava klijenta izvodi se prije nego što sesija portala postoji
export async function prijavaPortalaAkcija(_p: StanjePrijavePortala, fd: FormData): Promise<StanjePrijavePortala> {
  const email = String(fd.get("email") ?? "");
  const lozinka = String(fd.get("lozinka") ?? "");
  const { ip, preglednik } = await podaciZahtjeva();
  const r = await prijaviPortal(db, { email, lozinka, ip, preglednik });
  if (!r.ok) return { greska: r.greska, email };
  await postaviKolacicPortala(r.token);
  redirect("/portal");
}

export async function odjavaPortalaAkcija(): Promise<void> {
  await akcijaPortala(async () => {
    const token = await tokenPortala();
    if (token) await odjaviPortal(db, token);
    await obrisiKolacicPortala();
  });
  redirect("/portal/prijava");
}
