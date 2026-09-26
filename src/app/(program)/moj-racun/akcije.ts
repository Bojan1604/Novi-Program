"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import bwipjs from "bwip-js/node";
import { iskljuciDvaKoraka, noviRezervniKodovi, potvrdiDvaKoraka, zapocniDvaKoraka } from "@/services/dva-koraka";
import { promijeniVlastitePodatke, promijeniVlastituLozinku } from "@/services/korisnici";

export async function promijeniLozinkuAkcija(_p: Odgovor | undefined, fd: FormData) {
  return akcija("racun.lozinka", async (k) => {
    const nova = String(fd.get("nova") ?? "");
    if (nova !== String(fd.get("ponovljena") ?? "")) return { ok: false as const, greska: "Nove lozinke se ne podudaraju." };
    await promijeniVlastituLozinku(db, { ...k, sesijaId: k.sesija.sesijaId }, String(fd.get("trenutna") ?? ""), nova);
    return { ok: true as const, poruka: "Lozinka je promijenjena. Ostali uređaji su odjavljeni." };
  });
}

export async function mojiPodaciAkcija(_p: Odgovor | undefined, fd: FormData) {
  return akcija("racun.podaci", async (k) => {
    await promijeniVlastitePodatke(db, k, {
      ime: String(fd.get("ime") ?? ""),
      email: String(fd.get("email") ?? ""),
      lozinka: String(fd.get("lozinka") ?? ""),
    });
    revalidatePath("/", "layout");
    return { ok: true as const, poruka: "Spremljeno. Ubuduće se prijavljujete novom e-poštom." };
  });
}

export type OdgovorDvaKoraka = Odgovor & { tajna?: string; qr?: string; kodovi?: string[] };

export async function zapocniDvaKorakaAkcija(lozinka: string): Promise<OdgovorDvaKoraka> {
  return akcija("racun.dva-koraka", async (k): Promise<OdgovorDvaKoraka> => {
    const r = await zapocniDvaKoraka(db, k, String(lozinka));
    const png = await bwipjs.toBuffer({ bcid: "qrcode", text: r.adresa, scale: 4 });
    return { ok: true, poruka: "Skenirajte QR u aplikaciji i upišite kod.", tajna: r.tajna, qr: `data:image/png;base64,${png.toString("base64")}` };
  });
}

export async function potvrdiDvaKorakaAkcija(kod: string): Promise<OdgovorDvaKoraka> {
  return akcija("racun.dva-koraka", async (k): Promise<OdgovorDvaKoraka> => {
    const kodovi = await potvrdiDvaKoraka(db, k, String(kod));
    revalidatePath("/moj-racun");
    return { ok: true, poruka: "Prijava u dva koraka je uključena.", kodovi };
  });
}

export async function iskljuciDvaKorakaAkcija(lozinka: string, kod: string): Promise<OdgovorDvaKoraka> {
  return akcija("racun.dva-koraka", async (k): Promise<OdgovorDvaKoraka> => {
    await iskljuciDvaKoraka(db, k, String(lozinka), String(kod));
    revalidatePath("/moj-racun");
    return { ok: true, poruka: "Prijava u dva koraka je isključena." };
  });
}

export async function rezervniKodoviAkcija(lozinka: string): Promise<OdgovorDvaKoraka> {
  return akcija("racun.dva-koraka", async (k): Promise<OdgovorDvaKoraka> => {
    const kodovi = await noviRezervniKodovi(db, k, String(lozinka));
    revalidatePath("/moj-racun");
    return { ok: true, poruka: "Novi rezervni kodovi — stari više ne vrijede.", kodovi };
  });
}
