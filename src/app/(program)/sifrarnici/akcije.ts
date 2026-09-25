"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { procitajPolja } from "@/domain/polja";
import { imaPosebno } from "@/domain/prava";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Neuspjeh, Odgovor } from "@/lib/greske";
import { definicija } from "@/lib/sifrarnici";
import { obrisiSifrarnik, postaviAktivnost, spremiSifrarnik } from "@/services/sifrarnici";

export async function spremiSifrarnikAkcija(kljuc: string, id: string | null, _p: Odgovor<{ id: string }> | undefined, fd: FormData) {
  const def = definicija(kljuc);
  if (!def) return { ok: false, greska: "Nepoznat šifrarnik." } satisfies Neuspjeh;
  const r = await akcija("sifrarnici.spremi", async (k) => {
    const polja = def.polja.filter((p) => !p.osjetljivo || imaPosebno(k.prava, "costs"));
    const unos = procitajPolja(polja, (ime) => {
      const v = fd.get(ime);
      return typeof v === "string" ? v : null;
    });
    if (!unos.ok) return { ok: false as const, greska: "Provjerite označena polja.", polja: unos.polja };
    const noviId = await spremiSifrarnik(db, k, def, id, unos.vrijednosti);
    revalidatePath(`/sifrarnici/${kljuc}`);
    return { ok: true as const, poruka: "Spremljeno.", podaci: { id: noviId } };
  });
  if (r.ok && !id) redirect(`/sifrarnici/${kljuc}`);
  return r;
}

export async function aktivnostSifrarnikaAkcija(kljuc: string, id: string, aktivan: boolean) {
  const def = definicija(kljuc);
  if (!def) return { ok: false, greska: "Nepoznat šifrarnik." } satisfies Neuspjeh;
  return akcija("sifrarnici.aktivnost", async (k) => {
    await postaviAktivnost(db, k, def, id, aktivan);
    revalidatePath(`/sifrarnici/${kljuc}`);
    return { ok: true as const, poruka: aktivan ? "Aktivirano." : "Deaktivirano." };
  });
}

export async function obrisiSifrarnikAkcija(kljuc: string, id: string) {
  const def = definicija(kljuc);
  if (!def) return { ok: false, greska: "Nepoznat šifrarnik." } satisfies Neuspjeh;
  const r = await akcija("sifrarnici.obrisi", async (k) => {
    await obrisiSifrarnik(db, k, def, id);
    revalidatePath(`/sifrarnici/${kljuc}`);
    return { ok: true as const };
  });
  if (r.ok) redirect(`/sifrarnici/${kljuc}`);
  return r;
}
