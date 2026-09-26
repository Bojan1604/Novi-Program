"use server";

import { revalidatePath } from "next/cache";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { postaviPocetniBroj } from "@/services/brojac";
import { nizoviBrojeva, postaviLogo, probnaPoruka, spremiFiskalizaciju, spremiPostavkeFirme } from "@/services/postavke";

const ili = (fd: FormData, ime: string) => tekst(fd, ime) || null;

export async function spremiPostavkeAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("postavke.spremi", async (k): Promise<Odgovor> => {
    const broj = (ime: string) => (tekst(fd, ime) ? Number(tekst(fd, ime)) : null);
    const polja = await spremiPostavkeFirme(db, k, {
      naziv: tekst(fd, "naziv"),
      oib: tekst(fd, "oib"),
      adresa: ili(fd, "adresa"),
      postanskiBroj: ili(fd, "postanskiBroj"),
      mjesto: ili(fd, "mjesto"),
      email: ili(fd, "email"),
      telefon: ili(fd, "telefon"),
      web: ili(fd, "web"),
      iban: ili(fd, "iban"),
      banka: ili(fd, "banka"),
      uSustavuPdv: fd.get("uSustavuPdv") === "on",
      pdvPoNaplacenoj: fd.get("pdvPoNaplacenoj") === "on",
      oznakaProstora: tekst(fd, "oznakaProstora"),
      oznakaUredaja: tekst(fd, "oznakaUredaja"),
      rokPlacanjaDana: broj("rokPlacanjaDana") ?? -1,
      podnozje: ili(fd, "podnozje"),
      smtpHost: ili(fd, "smtpHost"),
      smtpPort: broj("smtpPort"),
      smtpSigurno: fd.get("smtpSigurno") === "on",
      smtpKorisnik: ili(fd, "smtpKorisnik"),
      smtpLozinka: fd.get("obrisiLozinku") === "on" ? "" : String(fd.get("smtpLozinka") ?? "") || null,
      epostaPosiljatelj: ili(fd, "epostaPosiljatelj"),
      epostaKopija: ili(fd, "epostaKopija"),
      boja: ili(fd, "boja"),
      kpdRoba: ili(fd, "kpdRoba"),
      kpdUsluga: ili(fd, "kpdUsluga"),
      kpdNajam: ili(fd, "kpdNajam"),
    });
    if (Object.keys(polja).length) return { ok: false, greska: "Provjerite označena polja.", polja };
    revalidatePath("/postavke");
    return { ok: true, poruka: "Postavke su spremljene. Vrijede za nove dokumente." };
  });
}

export async function probnaPorukaAkcija() {
  return akcija("postavke.spremi", async (k) => {
    await probnaPoruka(db, k);
    return { ok: true as const, poruka: "Probna poruka je poslana na Vašu e-poštu." };
  });
}

export async function spremiFiskalizacijuAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("postavke.spremi", async (k): Promise<Odgovor> => {
    const dat = fd.get("certifikat");
    const ima = dat instanceof File && dat.size > 0;
    const polja = await spremiFiskalizaciju(db, k, {
      nacin: tekst(fd, "fiskalNacin"),
      certifikat: ima ? { sadrzaj: Buffer.from(await dat.arrayBuffer()), lozinka: String(fd.get("lozinkaCertifikata") ?? "") } : null,
    });
    if (Object.keys(polja).length) return { ok: false, greska: "Provjerite označena polja.", polja };
    revalidatePath("/postavke");
    return { ok: true, poruka: "Postavke fiskalizacije su spremljene." };
  });
}

export async function logoAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("postavke.spremi", async (k): Promise<Odgovor> => {
    const f = fd.get("logo");
    const ukloni = fd.get("ukloni") === "1";
    if (!ukloni && (!(f instanceof File) || !f.size)) return { ok: false, greska: "Odaberite sliku (PNG ili JPEG)." };
    await postaviLogo(db, k, ukloni ? null : new Uint8Array(await (f as File).arrayBuffer()));
    revalidatePath("/postavke");
    return { ok: true, poruka: ukloni ? "Logo je uklonjen." : "Logo je spremljen — vidi se na novim dokumentima." };
  });
}

export async function pocetniBrojAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("postavke.spremi", async (k): Promise<Odgovor> => {
    const firma = await db.firma.findUniqueOrThrow({ where: { id: k.firmaId }, select: { oznakaProstora: true, oznakaUredaja: true } });
    const vrsta = tekst(fd, "vrsta");
    if (!nizoviBrojeva(firma).some((n) => n.vrsta === vrsta)) return { ok: false, greska: "Odaberite niz brojeva." };
    const pocetni = Number(tekst(fd, "pocetni"));
    if (!Number.isInteger(pocetni) || pocetni < 1) return { ok: false, greska: "Početni broj mora biti cijeli broj veći od 0." };
    await postaviPocetniBroj(db, k, vrsta, Number(tekst(fd, "godina")), pocetni);
    revalidatePath("/postavke");
    return { ok: true, poruka: `Sljedeći dokument u nizu dobiva broj ${pocetni}.` };
  });
}
