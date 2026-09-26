"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { procitajIznos } from "@/domain/novac";
import { dodajUredajeNaUgovor, otkaziUgovor, postaviCijenu, spremiUgovor } from "@/services/najam";
import { dodajPriloge, obrisiPrilog, type Datoteka } from "@/services/prilozi";

const ili = (fd: FormData, ime: string) => tekst(fd, ime) || null;

export async function spremiUgovorAkcija(id: string | null, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  const r = await akcija("najam.ugovor", async (k): Promise<Odgovor<{ id: string }>> => {
    const rok = tekst(fd, "rokPlacanjaDana");
    const s = await spremiUgovor(db, k, id, {
      partnerId: tekst(fd, "partnerId"),
      poslovnicaId: ili(fd, "poslovnicaId"),
      od: tekst(fd, "od"),
      do: ili(fd, "do"),
      rucniBroj: ili(fd, "broj"),
      rokPlacanjaDana: rok ? Number(rok) : -1,
      nacinPlacanja: tekst(fd, "nacinPlacanja") || "T",
      uvjeti: ili(fd, "uvjeti"),
      napomenaRacuna: ili(fd, "napomenaRacuna"),
      verzija: Number(tekst(fd, "verzija") || "0"),
    });
    if (!s.ok) return { ok: false, greska: "Provjerite označena polja.", polja: s.polja };
    revalidatePath("/najam");
    revalidatePath(`/najam/${s.id}`);
    return { ok: true, poruka: "Spremljeno.", podaci: { id: s.id } };
  });
  if (r.ok && !id && r.podaci) redirect(`/najam/${r.podaci.id}`);
  return r.ok ? { ok: true, poruka: r.poruka } : r;
}

export async function otkaziUgovorAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("najam.otkaz", async (k): Promise<Odgovor> => {
    const ponisti = fd.get("ponisti") === "1";
    await otkaziUgovor(db, k, id, ponisti ? null : tekst(fd, "datumOtkaza"), ili(fd, "razlogOtkaza"));
    revalidatePath(`/najam/${id}`);
    revalidatePath("/najam");
    return { ok: true, poruka: ponisti ? "Otkaz je poništen." : "Ugovor je otkazan." };
  });
}

export async function dodajPrilogeUgovoraAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("najam.prilozi", async (k): Promise<Odgovor> => {
    const datoteke: Datoteka[] = [];
    for (const f of fd.getAll("datoteke")) {
      if (!(f instanceof File) || (f.size === 0 && !f.name)) continue;
      datoteke.push({ naziv: f.name, velicina: f.size, sadrzaj: new Uint8Array(await f.arrayBuffer()) });
    }
    const n = await dodajPriloge(db, k, "UgovorNajma", id, datoteke);
    revalidatePath(`/najam/${id}`);
    return { ok: true, poruka: n === 1 ? "Prilog je dodan." : `Dodano priloga: ${n}.` };
  });
}

export async function obrisiPrilogUgovoraAkcija(id: string, prilogId: string): Promise<Odgovor> {
  return akcija("najam.prilozi", async (k): Promise<Odgovor> => {
    await obrisiPrilog(db, k, "UgovorNajma", prilogId);
    revalidatePath(`/najam/${id}`);
    return { ok: true, poruka: "Prilog je obrisan." };
  });
}

export async function dodajUredajeAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("najam.ugovor", async (k): Promise<Odgovor> => {
    const c = procitajIznos(tekst(fd, "cijena"));
    if (!c.ok) return { ok: false, greska: "Provjerite označena polja.", polja: { cijena: c.greska } };
    const n = await dodajUredajeNaUgovor(db, k, id, {
      serijski: tekst(fd, "serijski").split(/[\s,;]+/),
      od: tekst(fd, "od"),
      cijena: c.vrijednost,
      izvor: fd.get("izvor") === "KLIJENT" ? "KLIJENT" : "SKLADISTE",
    });
    revalidatePath(`/najam/${id}`);
    revalidatePath("/uredaji");
    return { ok: true, poruka: n === 1 ? "Uređaj je dodan na ugovor." : `Dodano uređaja: ${n}.` };
  });
}

export async function postaviCijenuAkcija(id: string, planIds: string[], _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("najam.ugovor", async (k): Promise<Odgovor> => {
    const c = procitajIznos(tekst(fd, "iznos"));
    if (!c.ok) return { ok: false, greska: c.greska, polja: { iznos: c.greska } };
    const doM = tekst(fd, "doMjeseca");
    await postaviCijenu(db, k, id, {
      planIds: planIds.slice(0, 5000).map(String),
      od: tekst(fd, "odMjeseca"),
      iznos: c.vrijednost,
      doMjeseca: doM || null,
    });
    revalidatePath(`/najam/${id}`);
    return { ok: true, poruka: `Cijena je postavljena za ${planIds.length} uređaja.` };
  });
}
