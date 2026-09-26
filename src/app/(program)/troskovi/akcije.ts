"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { procitajIznos } from "@/domain/novac";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { dodajPriloge, obrisiPrilog, type Datoteka } from "@/services/prilozi";
import { dodajKategoriju, obrisiTrosak, oznaciPlaceno, spremiPonavljajuci, spremiTrosak, zaustaviPonavljajuci } from "@/services/troskovi";

export async function spremiTrosakAkcija(id: string | null, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  const r = await akcija("troskovi.spremi", async (k): Promise<Odgovor<{ id: string }>> => {
    const i = procitajIznos(tekst(fd, "iznos"), { dopustiNegativno: true });
    const p = procitajIznos(tekst(fd, "pdv") || "0");
    if (!i.ok || !p.ok)
      return { ok: false, greska: "Provjerite označena polja.", polja: { ...(i.ok ? {} : { iznos: i.greska }), ...(p.ok ? {} : { pdv: p.greska }) } };
    const s = await spremiTrosak(db, k, id, {
      datum: tekst(fd, "datum"),
      kategorijaId: tekst(fd, "kategorijaId"),
      opis: tekst(fd, "opis"),
      iznos: i.vrijednost,
      pdv: p.vrijednost,
      placeno: fd.get("placeno") === "on",
    });
    if (!s.ok) return { ok: false, greska: "Provjerite označena polja.", polja: s.polja };
    revalidatePath("/troskovi");
    revalidatePath(`/troskovi/${s.id}`);
    return { ok: true, poruka: "Spremljeno.", podaci: { id: s.id } };
  });
  if (r.ok && id) return { ok: true, poruka: r.poruka };
  return r.ok ? { ok: true, poruka: "Trošak je upisan." } : r;
}

export async function placenoAkcija(id: string, placeno: boolean): Promise<Odgovor> {
  return akcija("troskovi.spremi", async (k): Promise<Odgovor> => {
    await oznaciPlaceno(db, k, String(id), placeno === true);
    revalidatePath("/troskovi");
    revalidatePath(`/troskovi/${id}`);
    return { ok: true, poruka: placeno ? "Označeno kao plaćeno." : "Vraćeno na neplaćeno." };
  });
}

export async function obrisiTrosakAkcija(id: string): Promise<Odgovor> {
  const r = await akcija("troskovi.obrisi", async (k): Promise<Odgovor> => {
    await obrisiTrosak(db, k, String(id));
    revalidatePath("/troskovi");
    return { ok: true };
  });
  if (r.ok) redirect("/troskovi");
  return r;
}

export async function ponavljajuciAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("troskovi.spremi", async (k): Promise<Odgovor> => {
    const i = procitajIznos(tekst(fd, "iznos"));
    if (!i.ok) return { ok: false, greska: i.greska };
    const p = procitajIznos(tekst(fd, "pdv") || "0");
    if (!p.ok) return { ok: false, greska: p.greska };
    await spremiPonavljajuci(db, k, {
      kategorijaId: tekst(fd, "kategorijaId"),
      opis: tekst(fd, "opis"),
      iznos: i.vrijednost,
      pdv: p.vrijednost,
      dan: Number(tekst(fd, "dan") || "1"),
      od: tekst(fd, "od"),
      do: tekst(fd, "do") || null,
    });
    revalidatePath("/troskovi");
    return { ok: true, poruka: "Ponavljajući trošak je spremljen (troškovi se stvaraju sami, jednom mjesečno)." };
  });
}

export async function zaustaviAkcija(id: string): Promise<Odgovor> {
  return akcija("troskovi.spremi", async (k): Promise<Odgovor> => {
    await zaustaviPonavljajuci(db, k, String(id));
    revalidatePath("/troskovi");
    return { ok: true, poruka: "Zaustavljeno." };
  });
}

export async function kategorijaAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("troskovi.spremi", async (k): Promise<Odgovor> => {
    await dodajKategoriju(db, k, tekst(fd, "naziv"));
    revalidatePath("/troskovi");
    return { ok: true, poruka: "Kategorija je dodana." };
  });
}

export async function dodajPrilogeTroskaAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("troskovi.prilozi", async (k): Promise<Odgovor> => {
    const datoteke: Datoteka[] = [];
    for (const f of fd.getAll("datoteke")) {
      if (!(f instanceof File) || (f.size === 0 && !f.name)) continue;
      datoteke.push({ naziv: f.name, velicina: f.size, sadrzaj: new Uint8Array(await f.arrayBuffer()) });
    }
    const n = await dodajPriloge(db, k, "Trosak", id, datoteke);
    revalidatePath(`/troskovi/${id}`);
    return { ok: true, poruka: n === 1 ? "Prilog je dodan." : `Dodano priloga: ${n}.` };
  });
}

export async function obrisiPrilogTroskaAkcija(id: string, prilogId: string): Promise<Odgovor> {
  return akcija("troskovi.prilozi", async (k): Promise<Odgovor> => {
    await obrisiPrilog(db, k, "Trosak", prilogId);
    revalidatePath(`/troskovi/${id}`);
    return { ok: true, poruka: "Prilog je obrisan." };
  });
}
