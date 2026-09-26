"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { dodajKlijentaPortala, novaLozinkaKlijenta, novaPoveznicaKlijenta, postaviAktivnostKlijenta } from "@/services/portal-pristup";

/** Odgovor s tajnom za jednokratni prikaz (poveznica ili lozinka) — ne sprema se nigdje osim u pregledniku zaposlenika. */
export type OdgovorPristupa = Odgovor & { tajna?: { vrsta: "poveznica" | "lozinka"; vrijednost: string; za: string } };

export async function dodajKlijentaAkcija(partnerId: string, _p: OdgovorPristupa | undefined, fd: FormData): Promise<OdgovorPristupa> {
  return akcija("portal.upravljaj", async (k): Promise<OdgovorPristupa> => {
    const email = tekst(fd, "email");
    const r = await dodajKlijentaPortala(db, k, String(partnerId), { ime: tekst(fd, "ime"), email });
    revalidatePath(`/partneri/${partnerId}`);
    return { ok: true, poruka: "Klijent dodan.", tajna: { vrsta: "poveznica", vrijednost: `/portal/lozinka/${r.token}`, za: email } };
  });
}

export async function aktivnostKlijentaAkcija(partnerId: string, id: string, aktivan: boolean): Promise<OdgovorPristupa> {
  return akcija("portal.upravljaj", async (k): Promise<OdgovorPristupa> => {
    await postaviAktivnostKlijenta(db, k, String(id), aktivan === true);
    revalidatePath(`/partneri/${partnerId}`);
    return { ok: true, poruka: aktivan ? "Klijent je uključen." : "Klijent je isključen i odjavljen." };
  });
}

export async function poveznicaKlijentaAkcija(partnerId: string, id: string, email: string): Promise<OdgovorPristupa> {
  return akcija("portal.upravljaj", async (k): Promise<OdgovorPristupa> => {
    const token = await novaPoveznicaKlijenta(db, k, String(id));
    revalidatePath(`/partneri/${partnerId}`);
    return {
      ok: true,
      poruka: "Nova poveznica (stara više ne vrijedi).",
      tajna: { vrsta: "poveznica", vrijednost: `/portal/lozinka/${token}`, za: String(email) },
    };
  });
}

export async function lozinkaKlijentaAkcija(partnerId: string, id: string, email: string): Promise<OdgovorPristupa> {
  return akcija("portal.upravljaj", async (k): Promise<OdgovorPristupa> => {
    const lozinka = await novaLozinkaKlijenta(db, k, String(id));
    revalidatePath(`/partneri/${partnerId}`);
    return {
      ok: true,
      poruka: "Nova lozinka — klijent je odjavljen sa svih uređaja.",
      tajna: { vrsta: "lozinka", vrijednost: lozinka, za: String(email) },
    };
  });
}
