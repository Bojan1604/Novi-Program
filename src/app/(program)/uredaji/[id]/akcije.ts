"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Polje } from "@/domain/polja";
import { procitajPolja } from "@/domain/polja";
import { imaPosebno } from "@/domain/prava";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { dodajPriloge, obrisiPrilog, type Datoteka } from "@/services/prilozi";
import { ispraviUredaj, obrisiUredaj, type IspravakUredaja } from "@/services/uredaji";

const POLJA: Polje[] = [
  { ime: "serijski", oznaka: "Serijski broj", vrsta: "tekst", najvise: 100 },
  { ime: "modelId", oznaka: "Model", vrsta: "odabir", izvor: "ModelUredaja" },
  { ime: "stanjeRobeId", oznaka: "Stanje robe", vrsta: "odabir", izvor: "StanjeRobe" },
  { ime: "jamstvoDo", oznaka: "Jamstvo do", vrsta: "datum" },
  { ime: "nabavnaCijena", oznaka: "Nabavna cijena", vrsta: "iznos", max: 100_000_000_00 },
  { ime: "cpu", oznaka: "Procesor", vrsta: "tekst" },
  { ime: "ram", oznaka: "RAM", vrsta: "tekst" },
  { ime: "disk", oznaka: "Disk", vrsta: "tekst" },
  { ime: "ekran", oznaka: "Ekran", vrsta: "tekst" },
  { ime: "os", oznaka: "Operacijski sustav", vrsta: "tekst" },
  { ime: "napomena", oznaka: "Napomena", vrsta: "dugiTekst", najvise: 2000 },
];

export async function ispraviUredajAkcija(id: string, _p: Odgovor | undefined, fd: FormData) {
  return akcija("uredaji.ispravak", async (k) => {
    // šalju se samo polja koja su na obrascu (zaključana i skrivena se ne šalju → ne mijenjaju se)
    const vidiNabavne = imaPosebno(k.prava, "costs");
    const prisutna = POLJA.filter((p) => fd.has(p.ime) && (vidiNabavne || p.ime !== "nabavnaCijena"));
    const r = procitajPolja(prisutna, (ime) => (fd.get(ime) as string | null) ?? null);
    if (!r.ok) return { ok: false as const, greska: "Provjerite označena polja.", polja: r.polja };
    const verzija = Number(fd.get("verzija"));
    if (!Number.isSafeInteger(verzija)) return { ok: false as const, greska: "Neispravni podaci obrasca." };
    const ulaz: IspravakUredaja = { verzija };
    for (const [ime, v] of Object.entries(r.vrijednosti)) (ulaz as Record<string, unknown>)[ime] = v;
    if (prisutna.some((p) => p.ime === "serijski") && !r.vrijednosti["serijski"])
      return { ok: false as const, greska: "Provjerite označena polja.", polja: { serijski: "Upišite serijski broj." } };
    await ispraviUredaj(db, k, id, ulaz);
    revalidatePath(`/uredaji/${id}`);
    return { ok: true as const, poruka: "Spremljeno." };
  });
}

export async function obrisiUredajAkcija(id: string) {
  const r = await akcija("uredaji.obrisi", async (k) => {
    await obrisiUredaj(db, k, id);
    revalidatePath("/uredaji");
    return { ok: true as const };
  });
  if (r.ok) redirect("/uredaji");
  return r;
}

export async function dodajPrilogeAkcija(id: string, _p: Odgovor | undefined, fd: FormData) {
  return akcija("uredaji.prilogDodaj", async (k) => {
    const datoteke: Datoteka[] = [];
    for (const f of fd.getAll("datoteke")) {
      if (!(f instanceof File) || (f.size === 0 && !f.name)) continue;
      datoteke.push({ naziv: f.name, velicina: f.size, sadrzaj: new Uint8Array(await f.arrayBuffer()) });
    }
    const n = await dodajPriloge(db, k, "Uredaj", id, datoteke);
    revalidatePath(`/uredaji/${id}`);
    return { ok: true as const, poruka: n === 1 ? "Prilog je dodan." : `Dodano priloga: ${n}.` };
  });
}

export async function obrisiPrilogAkcija(uredajId: string, prilogId: string) {
  return akcija("uredaji.prilogObrisi", async (k) => {
    await obrisiPrilog(db, k, "Uredaj", prilogId);
    revalidatePath(`/uredaji/${uredajId}`);
    return { ok: true as const, poruka: "Prilog je obrisan." };
  });
}
