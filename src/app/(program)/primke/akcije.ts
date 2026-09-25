"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { postojeciSerijski, stornirajPrimku, zaprimi } from "@/services/primke";

const tekst = z.string().trim().max(200).nullable().optional();
const SHEMA = z.object({
  datum: z.string(),
  skladisteId: z.string(),
  dobavljacId: z.string().nullable(),
  stanjeRobeId: z.string().nullable(),
  dokumentDobavljaca: tekst,
  napomena: z.string().trim().max(2000).nullable().optional(),
  knjiziUTroskove: z.boolean(),
  stavke: z
    .array(
      z.object({
        serijski: z.string().max(100),
        modelId: z.string(),
        nabavnaCijena: z.number().int().nonnegative().nullable(),
        cpu: tekst,
        ram: tekst,
        disk: tekst,
        ekran: tekst,
        os: tekst,
      }),
    )
    .max(5000),
});

export async function zaprimiAkcija(_p: Odgovor<{ id: string }> | undefined, fd: FormData) {
  const r = await akcija("primke.zaprimi", async (k) => {
    let podaci: unknown;
    try {
      podaci = JSON.parse(String(fd.get("podaci") ?? ""));
    } catch {
      return { ok: false as const, greska: "Neispravni podaci obrasca." };
    }
    const p = SHEMA.safeParse(podaci);
    if (!p.success) return { ok: false as const, greska: "Neispravni podaci obrasca." };
    const u = p.data;
    const primka = await zaprimi(db, k, {
      ...u,
      dokumentDobavljaca: u.dokumentDobavljaca || null,
      napomena: u.napomena || null,
      stavke: u.stavke.map((s) => ({ ...s, cpu: s.cpu || null, ram: s.ram || null, disk: s.disk || null, ekran: s.ekran || null, os: s.os || null })),
    });
    revalidatePath("/primke");
    return { ok: true as const, poruka: `Zaprimljeno: ${primka.broj}`, podaci: { id: primka.id } };
  });
  if (r.ok) redirect(`/primke/${r.podaci.id}`);
  return r;
}

/** Koji su od upisanih serijskih već u programu (prikaz prije zaprimanja). */
export async function provjeriSerijskeAkcija(serijski: string[]) {
  return akcija("primke.provjera", async (k) => {
    const lista = serijski.filter((s) => typeof s === "string").slice(0, 5000);
    return { ok: true as const, podaci: await postojeciSerijski(db, k.firmaId, lista) };
  });
}

export async function stornirajPrimkuAkcija(id: string) {
  return akcija("primke.storno", async (k) => {
    await stornirajPrimku(db, k, id);
    revalidatePath(`/primke/${id}`);
    return { ok: true as const, poruka: "Primka je stornirana." };
  });
}
