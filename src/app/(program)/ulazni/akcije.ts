"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatirajIznos, procitajIznos } from "@/domain/novac";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { dodajPriloge, obrisiPrilog, type Datoteka } from "@/services/prilozi";
import {
  demoPrimjerERacuna,
  odbijERacun,
  platiUlazni,
  preuzmiERacune,
  prihvatiERacun,
  spremiUlazniRacun,
  stornirajUlazniRacun,
} from "@/services/ulazni-racuni";

const ili = (fd: FormData, ime: string) => tekst(fd, ime) || null;

export async function spremiUlazniAkcija(id: string | null, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  const r = await akcija("ulazni.spremi", async (k): Promise<Odgovor<{ id: string }>> => {
    const o = procitajIznos(tekst(fd, "osnovica") || "0");
    const p = procitajIznos(tekst(fd, "pdv") || "0");
    const polja: Record<string, string> = {};
    if (!o.ok) polja["osnovica"] = o.greska;
    if (!p.ok) polja["pdv"] = p.greska;
    if (!o.ok || !p.ok) return { ok: false, greska: "Provjerite označena polja.", polja };
    const s = await spremiUlazniRacun(db, k, id, {
      broj: tekst(fd, "broj"),
      datum: tekst(fd, "datum"),
      dospijece: ili(fd, "dospijece"),
      dobavljacId: ili(fd, "dobavljacId"),
      dobavljacTekst: ili(fd, "dobavljacTekst"),
      dobavljacOib: ili(fd, "dobavljacOib"),
      narudzbenicaId: ili(fd, "narudzbenicaId"),
      primkaId: ili(fd, "primkaId"),
      zaRobu: fd.get("zaRobu") === "on",
      osnovica: o.vrijednost,
      pdv: p.vrijednost,
      opis: ili(fd, "opis"),
      verzija: Number(tekst(fd, "verzija") || "0"),
    });
    if (!s.ok) return { ok: false, greska: "Provjerite označena polja.", polja: s.polja };
    revalidatePath("/ulazni");
    revalidatePath(`/ulazni/${s.id}`);
    return { ok: true, poruka: "Spremljeno.", podaci: { id: s.id } };
  });
  if (r.ok && !id && r.podaci) redirect(`/ulazni/${r.podaci.id}`);
  return r.ok ? { ok: true, poruka: r.poruka } : r;
}

export async function stornoUlaznogAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("ulazni.storno", async (k): Promise<Odgovor> => {
    await stornirajUlazniRacun(db, k, String(id), tekst(fd, "razlog"));
    revalidatePath(`/ulazni/${id}`);
    revalidatePath("/ulazni");
    return { ok: true, poruka: "Račun je storniran." };
  });
}

export async function dodajPrilogeUlaznogAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("ulazni.prilozi", async (k): Promise<Odgovor> => {
    const datoteke: Datoteka[] = [];
    for (const f of fd.getAll("datoteke")) {
      if (!(f instanceof File) || (f.size === 0 && !f.name)) continue;
      datoteke.push({ naziv: f.name, velicina: f.size, sadrzaj: new Uint8Array(await f.arrayBuffer()) });
    }
    const n = await dodajPriloge(db, k, "UlazniRacun", id, datoteke);
    revalidatePath(`/ulazni/${id}`);
    return { ok: true, poruka: n === 1 ? "Prilog je dodan." : `Dodano priloga: ${n}.` };
  });
}

export async function obrisiPrilogUlaznogAkcija(id: string, prilogId: string): Promise<Odgovor> {
  return akcija("ulazni.prilozi", async (k): Promise<Odgovor> => {
    await obrisiPrilog(db, k, "UlazniRacun", prilogId);
    revalidatePath(`/ulazni/${id}`);
    return { ok: true, poruka: "Prilog je obrisan." };
  });
}

export async function preuzmiERacuneAkcija(): Promise<Odgovor> {
  return akcija("ulazni.eracun", async (k): Promise<Odgovor> => {
    const r = await preuzmiERacune(db, k);
    revalidatePath("/ulazni");
    return {
      ok: true,
      poruka: `Preuzeto eRačuna: ${r.preuzeto}.${r.preskoceno.length ? ` Preskočeno: ${r.preskoceno.join("; ")}` : ""}`,
    };
  });
}

export async function demoPrimjerAkcija(): Promise<Odgovor> {
  return akcija("ulazni.eracun", async (k): Promise<Odgovor> => {
    await demoPrimjerERacuna(db, k);
    return { ok: true, poruka: "Primjer eRačuna čeka u pretincu — kliknite „Preuzmi eRačune“." };
  });
}

export async function prihvatiAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("ulazni.eracun", async (k): Promise<Odgovor> => {
    const r = await prihvatiERacun(db, k, String(id), {
      narudzbenicaId: ili(fd, "narudzbenicaId"),
      primkaId: ili(fd, "primkaId"),
      zaRobu: fd.get("zaRobu") === "on",
    });
    revalidatePath(`/ulazni/${id}`);
    revalidatePath("/ulazni");
    return {
      ok: true,
      poruka: r.razlikaRobe ? `Prihvaćeno. Trošak robe povećan za ${formatirajIznos(r.razlikaRobe)} € (samo razlika iznad primke).` : "Prihvaćeno.",
    };
  });
}

export async function odbijAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("ulazni.eracun", async (k): Promise<Odgovor> => {
    await odbijERacun(db, k, String(id), tekst(fd, "razlog"));
    revalidatePath(`/ulazni/${id}`);
    revalidatePath("/ulazni");
    return { ok: true, poruka: "eRačun je odbijen; dobavljač i Porezna su obaviješteni." };
  });
}

export async function platiAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("ulazni.plati", async (k): Promise<Odgovor> => {
    const i = procitajIznos(tekst(fd, "iznos"));
    if (!i.ok) return { ok: false, greska: i.greska };
    await platiUlazni(db, k, String(id), { datum: tekst(fd, "datum"), iznos: i.vrijednost });
    revalidatePath(`/ulazni/${id}`);
    return { ok: true, poruka: "Plaćanje je upisano." };
  });
}
