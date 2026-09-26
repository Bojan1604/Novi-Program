import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { kolacicSecure, type NacinSecure } from "@/domain/prijava";
import { provjeriSesijuPortala, type SesijaPortala } from "@/services/portal";
import { db, dbFirme } from "./db";
import { GreskaKorisniku, type Neuspjeh } from "./greske";
import { podaciZahtjeva } from "./sesija";

/** Kolačić portala vrijedi samo za /portal — nikad se ne šalje programu (i obrnuto, program ga ne prihvaća). */
export const KOLACIC_PORTALA = "erp_portal";
const PUTANJA = "/portal";
const KOLACIC_MAX_SEKUNDI = 400 * 24 * 60 * 60;

export type KontekstPortala = SesijaPortala & {
  firmaId: string;
  partnerId: string;
  ip: string;
  /** baza ograničena na firmu klijenta — upiti uz to UVIJEK filtriraju po partnerId */
  db: ReturnType<typeof dbFirme>;
};

export const trenutniKlijent = cache(async (): Promise<KontekstPortala | null> => {
  const token = (await cookies()).get(KOLACIC_PORTALA)?.value;
  if (!token) return null;
  const s = await provjeriSesijuPortala(db, token);
  if (!s) return null;
  const { ip } = await podaciZahtjeva();
  return { ...s, firmaId: s.firma.id, partnerId: s.partner.id, ip, db: dbFirme(s.firma.id) };
});

/** Stranica portala: bez prijave klijenta → prijava portala. */
export async function pristupPortalu(): Promise<KontekstPortala> {
  const k = await trenutniKlijent();
  if (!k) redirect("/portal/prijava");
  return k;
}

/** Omotač SVAKE akcije portala (kao `akcija` u programu): prijava klijenta, zatim radnja. */
export async function akcijaPortala<T>(radnja: (k: KontekstPortala) => Promise<T>): Promise<T | Neuspjeh> {
  const k = await trenutniKlijent();
  if (!k) redirect("/portal/prijava");
  try {
    return await radnja(k);
  } catch (greska) {
    if (greska instanceof GreskaKorisniku) return { ok: false, greska: greska.message };
    throw greska;
  }
}

/** API ruta portala: kontekst ili 401. */
export async function pristupPortalApi(): Promise<KontekstPortala | Response> {
  const k = await trenutniKlijent();
  if (!k) return Response.json({ greska: "Niste prijavljeni." }, { status: 401 });
  return k;
}

export async function postaviKolacicPortala(token: string): Promise<void> {
  const { protokol } = await podaciZahtjeva();
  const nacin = (process.env["KOLACIC_SECURE"] as NacinSecure | undefined) ?? "auto";
  (await cookies()).set(KOLACIC_PORTALA, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: kolacicSecure(protokol, nacin),
    path: PUTANJA,
    maxAge: KOLACIC_MAX_SEKUNDI,
  });
}

export async function tokenPortala(): Promise<string | null> {
  return (await cookies()).get(KOLACIC_PORTALA)?.value ?? null;
}

export async function obrisiKolacicPortala(): Promise<void> {
  (await cookies()).delete({ name: KOLACIC_PORTALA, path: PUTANJA });
}
