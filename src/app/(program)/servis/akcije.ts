"use server";

import { formatirajIznos, type Centi } from "@/domain/novac";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STATUSI_SERVISA } from "@/domain/servis";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { dodajPriloge, obrisiPrilog, type Datoteka } from "@/services/prilozi";
import {
  izdajZamjenu,
  obrisiNalog,
  postaviJavnostPriloga,
  promijeniStatusServisa,
  spremiDijagnozu,
  vratiZamjenu,
  zaprimiNaServis,
  zaprimiPrijavu,
  zavrsiNalog,
} from "@/services/servis";

const ili = (fd: FormData, ime: string) => tekst(fd, ime) || null;
const osvjezi = (id: string) => {
  revalidatePath(`/servis/${id}`);
  revalidatePath("/servis");
};

export async function zaprimiAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  const r = await akcija("servis.zaprimi", async (k) => {
    const n = await zaprimiNaServis(db, k, {
      serijski: tekst(fd, "serijski"),
      opisKvara: tekst(fd, "opisKvara"),
      datum: tekst(fd, "datum"),
      skladisteId: ili(fd, "skladisteId"),
      kontakt: ili(fd, "kontakt"),
    });
    revalidatePath("/servis");
    return { ok: true as const, podaci: n };
  });
  if (r.ok) redirect(`/servis/${r.podaci.id}`);
  return r;
}

export async function statusAkcija(id: string, verzija: number, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("servis.uredi", async (k): Promise<Odgovor> => {
    const status = tekst(fd, "status");
    await promijeniStatusServisa(db, k, String(id), { status, poruka: ili(fd, "poruka"), verzija: Number(verzija) });
    osvjezi(id);
    return { ok: true, poruka: `Status: ${STATUSI_SERVISA[status as keyof typeof STATUSI_SERVISA] ?? status}.` };
  });
}

export async function dijagnozaAkcija(id: string, verzija: number, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("servis.uredi", async (k): Promise<Odgovor> => {
    await spremiDijagnozu(db, k, String(id), {
      dijagnoza: ili(fd, "dijagnoza"),
      napomenaKlijentu: ili(fd, "napomenaKlijentu"),
      verzija: Number(verzija),
    });
    osvjezi(id);
    return { ok: true, poruka: "Spremljeno." };
  });
}

export async function zamjenaAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("servis.zamjena", async (k): Promise<Odgovor> => {
    await izdajZamjenu(db, k, String(id), { serijski: tekst(fd, "serijski"), datum: tekst(fd, "datum") });
    osvjezi(id);
    return { ok: true, poruka: "Zamjenski uređaj je izdan." };
  });
}

export async function povratZamjeneAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("servis.zamjena", async (k): Promise<Odgovor> => {
    await vratiZamjenu(db, k, String(id), { skladisteId: tekst(fd, "skladisteId"), datum: tekst(fd, "datum") });
    osvjezi(id);
    return { ok: true, poruka: "Zamjenski uređaj je vraćen." };
  });
}

function zavrsetak(fd: FormData) {
  return { datum: tekst(fd, "datum"), skladisteId: ili(fd, "skladisteId"), napomena: ili(fd, "napomena") };
}

export async function zavrsiAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("servis.zavrsi", async (k): Promise<Odgovor> => {
    const ishod = tekst(fd, "ishod") === "OTKAZAN" ? "OTKAZAN" : "VRACEN";
    await zavrsiNalog(db, k, String(id), { ishod, ...zavrsetak(fd) });
    osvjezi(id);
    return { ok: true, poruka: ishod === "OTKAZAN" ? "Nalog je otkazan." : "Nalog je završen, uređaj vraćen." };
  });
}

export async function otpisAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("servis.otpis", async (k): Promise<Odgovor> => {
    const r = await zavrsiNalog(db, k, String(id), { ishod: "OTPISAN", ...zavrsetak(fd) });
    osvjezi(id);
    return {
      ok: true,
      poruka: r.visak
        ? `Uređaj je otpisan. Višak naplaćenog najma ${formatirajIznos(r.visak as Centi, true)} — odobrenje na ugovoru.`
        : "Uređaj je otpisan.",
    };
  });
}

export async function obrisiAkcija(id: string): Promise<Odgovor> {
  const r = await akcija("servis.obrisi", async (k): Promise<Odgovor> => {
    await obrisiNalog(db, k, String(id));
    revalidatePath("/servis");
    return { ok: true, poruka: "Obrisano." };
  });
  if (r.ok) redirect("/servis");
  return r;
}

export async function dodajPrilogeAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("servis.prilozi", async (k): Promise<Odgovor> => {
    const datoteke: Datoteka[] = [];
    for (const f of fd.getAll("datoteke")) {
      if (!(f instanceof File) || (f.size === 0 && !f.name)) continue;
      datoteke.push({ naziv: f.name, velicina: f.size, sadrzaj: new Uint8Array(await f.arrayBuffer()) });
    }
    const n = await dodajPriloge(db, k, "ServisniNalog", id, datoteke);
    revalidatePath(`/servis/${id}`);
    return { ok: true, poruka: n === 1 ? "Prilog je dodan." : `Dodano priloga: ${n}.` };
  });
}

export async function obrisiPrilogAkcija(id: string, prilogId: string): Promise<Odgovor> {
  return akcija("servis.prilozi", async (k): Promise<Odgovor> => {
    await obrisiPrilog(db, k, "ServisniNalog", prilogId);
    revalidatePath(`/servis/${id}`);
    return { ok: true, poruka: "Prilog je obrisan." };
  });
}

export async function zaprimiPrijavuAkcija(id: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("servis.zaprimi", async (k): Promise<Odgovor> => {
    await zaprimiPrijavu(db, k, String(id), { datum: tekst(fd, "datum"), skladisteId: ili(fd, "skladisteId") });
    osvjezi(id);
    return { ok: true, poruka: "Uređaj je zaprimljen na servis." };
  });
}

export async function javnostPrilogaAkcija(id: string, prilogId: string, javno: boolean): Promise<Odgovor> {
  return akcija("servis.prilozi", async (k): Promise<Odgovor> => {
    await postaviJavnostPriloga(db, k, String(id), String(prilogId), javno === true);
    revalidatePath(`/servis/${id}`);
    return { ok: true, poruka: javno ? "Prilog je vidljiv klijentu." : "Prilog je samo interni." };
  });
}
