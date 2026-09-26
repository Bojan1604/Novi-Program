"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sigurnaPutanja } from "@/domain/prijava";
import { db } from "@/lib/db";
import { KOLACIC_DRUGOG_KORAKA, podaciZahtjeva, postaviKolacicSesije, sigurnaVeza } from "@/lib/sesija";
import { dovrsiPrijavu, prijavi } from "@/services/prijava";

export type StanjePrijave = { greska?: string; email?: string } | undefined;

// javna akcija: prijava se izvodi prije nego što sesija postoji
export async function prijaviSe(_prethodno: StanjePrijave, formData: FormData): Promise<StanjePrijave> {
  const email = String(formData.get("email") ?? "");
  const lozinka = String(formData.get("lozinka") ?? "");
  const dalje = sigurnaPutanja(String(formData.get("dalje") ?? "/"));

  const { ip, preglednik } = await podaciZahtjeva();
  const rezultat = await prijavi(db, { email, lozinka, ip, preglednik });
  if (!rezultat.ok && rezultat.drugiKorak) {
    // lozinka je točna, ali treba kod iz aplikacije: kratki kolačić samo za /prijava
    (await cookies()).set(KOLACIC_DRUGOG_KORAKA, rezultat.drugiKorak, {
      httpOnly: true,
      sameSite: "lax",
      secure: await sigurnaVeza(),
      path: "/prijava",
      maxAge: 300,
    });
    redirect(`/prijava/kod?dalje=${encodeURIComponent(dalje)}`);
  }
  if (!rezultat.ok) return { greska: rezultat.greska, email };

  await postaviKolacicSesije(rezultat.token);
  redirect(dalje);
}

export type StanjeKoda = { greska?: string } | undefined;

// javna akcija: drugi korak prijave (kod iz aplikacije ili rezervni kod) — sesija još ne postoji
export async function potvrdiKodAkcija(_p: StanjeKoda, fd: FormData): Promise<StanjeKoda> {
  const dalje = sigurnaPutanja(String(fd.get("dalje") ?? "/"));
  const kolacici = await cookies();
  const token = kolacici.get(KOLACIC_DRUGOG_KORAKA)?.value ?? "";
  const { ip } = await podaciZahtjeva();
  const r = await dovrsiPrijavu(db, { drugiKorak: token, kod: String(fd.get("kod") ?? ""), ip });
  if (!r.ok) {
    if (r.greska.includes("istekla")) {
      kolacici.delete({ name: KOLACIC_DRUGOG_KORAKA, path: "/prijava" });
      redirect("/prijava");
    }
    return { greska: r.greska };
  }
  kolacici.delete({ name: KOLACIC_DRUGOG_KORAKA, path: "/prijava" });
  await postaviKolacicSesije(r.token);
  redirect(dalje);
}
