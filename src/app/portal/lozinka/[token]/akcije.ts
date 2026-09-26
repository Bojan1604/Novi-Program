"use server";

import { db } from "@/lib/db";
import { GreskaKorisniku } from "@/lib/greske";
import { postaviLozinkuPoveznicom } from "@/services/portal-pristup";

export type StanjeLozinke = { ok?: boolean; greska?: string; email?: string } | undefined;

// javna akcija: klijent postavlja lozinku preko jednokratne poveznice (još nema sesiju)
export async function postaviLozinkuAkcija(token: string, _p: StanjeLozinke, fd: FormData): Promise<StanjeLozinke> {
  const lozinka = String(fd.get("lozinka") ?? "");
  if (lozinka !== String(fd.get("ponovljena") ?? "")) return { greska: "Lozinke se ne podudaraju." };
  try {
    const r = await postaviLozinkuPoveznicom(db, String(token), lozinka);
    return { ok: true, email: r.email };
  } catch (g) {
    if (g instanceof GreskaKorisniku) return { greska: g.message };
    throw g;
  }
}
