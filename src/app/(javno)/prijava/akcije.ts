"use server";

import { redirect } from "next/navigation";
import { sigurnaPutanja } from "@/domain/prijava";
import { db } from "@/lib/db";
import { podaciZahtjeva, postaviKolacicSesije } from "@/lib/sesija";
import { prijavi } from "@/services/prijava";

export type StanjePrijave = { greska?: string; email?: string } | undefined;

export async function prijaviSe(_prethodno: StanjePrijave, formData: FormData): Promise<StanjePrijave> {
  const email = String(formData.get("email") ?? "");
  const lozinka = String(formData.get("lozinka") ?? "");
  const dalje = sigurnaPutanja(String(formData.get("dalje") ?? "/"));

  const { ip, preglednik } = await podaciZahtjeva();
  const rezultat = await prijavi(db, { email, lozinka, ip, preglednik });
  if (!rezultat.ok) return { greska: rezultat.greska, email };

  await postaviKolacicSesije(rezultat.token);
  redirect(dalje);
}
