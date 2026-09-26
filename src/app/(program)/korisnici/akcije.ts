"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { iznimkeIzObrasca, tekst } from "@/lib/obrazac";
import { otkaziPoziv, pozoviKorisnika } from "@/services/firme";
import { dodajKorisnika, postaviLozinku, urediKorisnika } from "@/services/korisnici";

export async function dodajKorisnikaAkcija(_p: Odgovor<{ korisnikId: string }> | undefined, fd: FormData) {
  return akcija("korisnici.dodaj", async (k) => {
    await dodajKorisnika(db, k, {
      ime: tekst(fd, "ime"),
      email: tekst(fd, "email"),
      lozinka: String(fd.get("lozinka") ?? ""),
      ulogaId: tekst(fd, "ulogaId"),
    });
    revalidatePath("/korisnici");
    return {
      ok: true as const,
      poruka: "Korisnik je dodan.",
    };
  });
}

export async function urediKorisnikaAkcija(korisnikId: string, _p: Odgovor | undefined, fd: FormData) {
  return akcija("korisnici.uredi", async (k) => {
    await urediKorisnika(db, k, korisnikId, {
      ime: tekst(fd, "ime"),
      oib: tekst(fd, "oib"),
      ulogaId: tekst(fd, "ulogaId"),
      iznimke: iznimkeIzObrasca(fd),
      aktivno: fd.get("aktivno") === "on",
    });
    revalidatePath("/korisnici");
    return { ok: true as const, poruka: "Spremljeno." };
  });
}

export async function postaviLozinkuAkcija(korisnikId: string, _p: Odgovor | undefined, fd: FormData) {
  return akcija("korisnici.lozinka", async (k) => {
    const lozinka = String(fd.get("lozinka") ?? "");
    if (lozinka !== String(fd.get("ponovljena") ?? "")) return { ok: false as const, greska: "Lozinke se ne podudaraju." };
    await postaviLozinku(db, k, korisnikId, lozinka);
    return { ok: true as const, poruka: "Lozinka je promijenjena; korisnik je odjavljen sa svih uređaja." };
  });
}

export async function pozoviAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("korisnici.poziv", async (k): Promise<Odgovor> => {
    await pozoviKorisnika(db, k, { email: tekst(fd, "email"), ulogaId: tekst(fd, "ulogaId") });
    revalidatePath("/korisnici");
    return { ok: true, poruka: "Poziv je spremljen — osoba ga prihvaća na stranici Firme nakon prijave." };
  });
}

export async function otkaziPozivAkcija(id: string): Promise<Odgovor> {
  return akcija("korisnici.poziv", async (k): Promise<Odgovor> => {
    await otkaziPoziv(db, k, id);
    revalidatePath("/korisnici");
    return { ok: true, poruka: "Poziv je otkazan." };
  });
}
