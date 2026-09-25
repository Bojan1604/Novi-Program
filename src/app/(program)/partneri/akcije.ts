"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { procitajOib } from "@/domain/oib";
import { procitajPdvBroj } from "@/domain/partner";
import { procitajPartnera } from "@/domain/partner-unos";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import {
  aktivnostPartnera,
  aktivnostPoslovnice,
  dohvatiPodatkeTvrtke,
  obrisiPartnera,
  provjeriViesPartnera,
  spremiPartnera,
  spremiPoslovnicu,
} from "@/services/partneri";

const citaj = (fd: FormData) => (ime: string) => {
  const v = fd.get(ime);
  return typeof v === "string" ? v : null;
};

export async function spremiPartneraAkcija(id: string | null, _p: Odgovor<{ id: string }> | undefined, fd: FormData) {
  const r = await akcija("partneri.spremi", async (k) => {
    const u = procitajPartnera(citaj(fd));
    if (!u.ok) return { ok: false as const, greska: "Provjerite označena polja.", polja: u.polja };
    const noviId = await spremiPartnera(db, k, id, u.vrijednost);
    revalidatePath("/partneri");
    return { ok: true as const, poruka: "Spremljeno.", podaci: { id: noviId } };
  });
  if (r.ok && !id) redirect(`/partneri/${r.podaci.id}`);
  return r;
}

export async function dohvatiPodatkeAkcija(drzava: string, oibUpis: string, pdvUpis: string) {
  return akcija("partneri.dohvat", async () => {
    const d = (drzava || "HR").toUpperCase();
    const oib = oibUpis.trim() ? procitajOib(oibUpis) : null;
    if (oib && !oib.ok) return { ok: false as const, greska: oib.greska };
    const pdv = pdvUpis.trim() ? procitajPdvBroj(pdvUpis, d) : null;
    if (pdv && !pdv.ok) return { ok: false as const, greska: pdv.greska };
    const podaci = await dohvatiPodatkeTvrtke(d, oib?.ok ? oib.vrijednost : null, pdv?.ok ? pdv.vrijednost : null);
    return { ok: true as const, poruka: `Podaci iz izvora: ${podaci.izvor}.`, podaci };
  });
}

export async function provjeriViesAkcija(id: string) {
  return akcija("partneri.vies", async (k) => {
    const valjan = await provjeriViesPartnera(db, k, id);
    revalidatePath(`/partneri/${id}`);
    return { ok: true as const, poruka: valjan ? "VIES: PDV broj je valjan." : "VIES: PDV broj NIJE valjan." };
  });
}

export async function aktivnostPartneraAkcija(id: string, aktivan: boolean) {
  return akcija("partneri.aktivnost", async (k) => {
    await aktivnostPartnera(db, k, id, aktivan);
    revalidatePath(`/partneri/${id}`);
    return { ok: true as const, poruka: aktivan ? "Aktivirano." : "Deaktivirano." };
  });
}

export async function obrisiPartneraAkcija(id: string) {
  const r = await akcija("partneri.obrisi", async (k) => {
    await obrisiPartnera(db, k, id);
    return { ok: true as const };
  });
  if (r.ok) redirect("/partneri");
  return r;
}

export async function spremiPoslovnicuAkcija(partnerId: string, id: string | null, _p: Odgovor | undefined, fd: FormData) {
  return akcija("poslovnice.spremi", async (k) => {
    const prazno = (ime: string) => tekst(fd, ime) || null;
    await spremiPoslovnicu(db, k, partnerId, id, {
      naziv: tekst(fd, "naziv"),
      adresa: prazno("adresa"),
      postanskiBroj: prazno("postanskiBroj"),
      mjesto: prazno("mjesto"),
      kontakt: prazno("kontakt"),
      telefon: prazno("telefon"),
    });
    revalidatePath(`/partneri/${partnerId}`);
    return { ok: true as const, poruka: "Poslovnica je spremljena." };
  });
}

export async function aktivnostPoslovniceAkcija(partnerId: string, id: string, aktivan: boolean) {
  return akcija("poslovnice.spremi", async (k) => {
    await aktivnostPoslovnice(db, k, id, aktivan);
    revalidatePath(`/partneri/${partnerId}`);
    return { ok: true as const, poruka: aktivan ? "Poslovnica aktivirana." : "Poslovnica deaktivirana." };
  });
}
