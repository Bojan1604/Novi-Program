"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { obrisiKolacicSesije, tokenIzKolacica } from "@/lib/sesija";
import { odjavi } from "@/services/prijava";

// javna akcija: odjava briše samo vlastitu sesiju iz kolačića
export async function odjaviSe(): Promise<void> {
  const token = await tokenIzKolacica();
  if (token) await odjavi(db, token);
  await obrisiKolacicSesije();
  redirect("/prijava");
}
