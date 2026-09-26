"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { VrstaOrganizacije } from "@/domain/mdm";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { tekst } from "@/lib/obrazac";
import { dopustiPonovniUpis, noviKodUpisa, postaviStanjeMdmUredaja, spremiOrganizaciju } from "@/services/mdm";
import { dodajDatoteku, dodijeliAplikaciju, obrisiDatoteku, otkaziNaredbu, posaljiNaredbu, spremiProfil } from "@/services/mdm-upravljanje";

export async function spremiOrganizacijuAkcija(id: string | null, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  const r = await akcija("mdm.organizacije", async (k) => {
    const oid = await spremiOrganizaciju(db, k, id, {
      naziv: tekst(fd, "naziv"),
      vrsta: tekst(fd, "vrsta") as VrstaOrganizacije,
      nadredenaId: tekst(fd, "nadredenaId") || null,
      partnerId: tekst(fd, "partnerId") || null,
      aktivna: id ? fd.get("aktivna") === "on" : true,
    });
    revalidatePath("/mdm");
    revalidatePath(`/mdm/${oid}`);
    return { ok: true as const, podaci: oid };
  });
  if (r.ok && !id) redirect(`/mdm/${r.podaci}`);
  return r.ok ? { ok: true, poruka: "Spremljeno." } : r;
}

export async function noviKodAkcija(id: string): Promise<Odgovor> {
  return akcija("mdm.organizacije", async (k): Promise<Odgovor> => {
    await noviKodUpisa(db, k, String(id));
    revalidatePath(`/mdm/${id}`);
    return { ok: true, poruka: "Novi kod upisa (stari više ne vrijedi)." };
  });
}

export async function stanjeUredajaAkcija(id: string, blokiraj: boolean): Promise<Odgovor> {
  return akcija("mdm.uredaji", async (k): Promise<Odgovor> => {
    await postaviStanjeMdmUredaja(db, k, String(id), blokiraj === true ? "BLOKIRAN" : "AKTIVAN");
    revalidatePath(`/mdm/uredaji/${id}`);
    return { ok: true, poruka: blokiraj ? "Uređaj je blokiran." : "Uređaj je ponovno aktivan." };
  });
}

export async function spremiProfilAkcija(id: string | null, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("mdm.upravljanje", async (k): Promise<Odgovor> => {
    const wifi = tekst(fd, "wifiLozinka");
    await spremiProfil(db, k, id, {
      naziv: tekst(fd, "naziv"),
      organizacijaId: tekst(fd, "organizacijaId") || null,
      platforma: tekst(fd, "platforma") === "WINDOWS" ? "WINDOWS" : "ANDROID",
      postavke: {
        lozinkaMin: tekst(fd, "lozinkaMin"),
        zakljucajNakonMin: tekst(fd, "zakljucajNakonMin"),
        kameraDopustena: fd.get("kameraDopustena") === "on",
        usbDopusten: fd.get("usbDopusten") === "on",
        wifiSsid: tekst(fd, "wifiSsid"),
        kiosk: tekst(fd, "kiosk"),
      },
      wifiLozinka: fd.get("obrisiWifi") === "on" ? "" : wifi || null,
      aktivan: id ? fd.get("aktivan") === "on" : true,
    });
    revalidatePath("/mdm/profili");
    return { ok: true, poruka: "Profil je spremljen — uređaji ga dobivaju pri sljedećem javljanju." };
  });
}

export async function dodjelaAkcija(organizacijaId: string, paket: string, platforma: string, dodijeli: boolean): Promise<Odgovor> {
  return akcija("mdm.upravljanje", async (k): Promise<Odgovor> => {
    await dodijeliAplikaciju(
      db,
      k,
      String(organizacijaId),
      { paket: String(paket), platforma: platforma === "WINDOWS" ? "WINDOWS" : "ANDROID" },
      dodijeli === true,
    );
    revalidatePath(`/mdm/${organizacijaId}`);
    return { ok: true, poruka: dodijeli ? "Aplikacija je dodijeljena." : "Dodjela je uklonjena." };
  });
}

export async function dodajDatotekuAkcija(organizacijaId: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("mdm.upravljanje", async (k): Promise<Odgovor> => {
    const f = fd.get("datoteka");
    if (!(f instanceof File) || !f.size) return { ok: false, greska: "Odaberite datoteku." };
    await dodajDatoteku(db, k, String(organizacijaId), {
      putanja: tekst(fd, "putanja"),
      datoteka: { naziv: f.name, sadrzaj: new Uint8Array(await f.arrayBuffer()) },
    });
    revalidatePath(`/mdm/${organizacijaId}`);
    return { ok: true, poruka: "Datoteka se šalje uređajima pri sljedećem javljanju." };
  });
}

export async function obrisiDatotekuAkcija(organizacijaId: string, id: string): Promise<Odgovor> {
  return akcija("mdm.upravljanje", async (k): Promise<Odgovor> => {
    await obrisiDatoteku(db, k, String(id));
    revalidatePath(`/mdm/${organizacijaId}`);
    return { ok: true, poruka: "Obrisano." };
  });
}

export async function naredbaAkcija(mdmUredajId: string, _p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  return akcija("mdm.naredbe", async (k): Promise<Odgovor> => {
    await posaljiNaredbu(db, k, String(mdmUredajId), tekst(fd, "vrsta"), {
      tekst: tekst(fd, "tekst"),
      paket: tekst(fd, "paket"),
      aplikacijaId: tekst(fd, "aplikacijaId"),
    });
    revalidatePath(`/mdm/uredaji/${mdmUredajId}`);
    return { ok: true, poruka: "Naredba čeka javljanje uređaja." };
  });
}

export async function otkaziNaredbuAkcija(mdmUredajId: string, id: string): Promise<Odgovor> {
  return akcija("mdm.naredbe", async (k): Promise<Odgovor> => {
    await otkaziNaredbu(db, k, String(id));
    revalidatePath(`/mdm/uredaji/${mdmUredajId}`);
    return { ok: true, poruka: "Naredba je otkazana." };
  });
}

export async function ponovniUpisAkcija(id: string): Promise<Odgovor> {
  return akcija("mdm.uredaji", async (k): Promise<Odgovor> => {
    await dopustiPonovniUpis(db, k, String(id));
    revalidatePath(`/mdm/uredaji/${id}`);
    return { ok: true, poruka: "Uređaj se može jednom ponovno upisati (i kodom druge organizacije)." };
  });
}
