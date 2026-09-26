import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { kolacicSecure, type NacinSecure } from "@/domain/prijava";
import { provjeriSesiju, type Sesija } from "@/services/prijava";
import { db } from "./db";

export const KOLACIC_SESIJE = "erp_sesija";
/** prijava u dva koraka: token čekanja na kod (5 min, samo /prijava) */
export const KOLACIC_DRUGOG_KORAKA = "erp_2k";
/** Kolačić živi dugo; stvarni istek (14 dana neaktivnosti) odlučuje baza. */
const KOLACIC_MAX_SEKUNDI = 400 * 24 * 60 * 60;

/** Trenutna sesija (jednom po zahtjevu) ili null. */
export const trenutnaSesija = cache(async (): Promise<Sesija | null> => {
  const token = (await cookies()).get(KOLACIC_SESIJE)?.value;
  if (!token) return null;
  return provjeriSesiju(db, token);
});

/** Sesija ili preusmjeravanje na prijavu. */
export async function zahtijevajPrijavu(): Promise<Sesija> {
  const sesija = await trenutnaSesija();
  if (!sesija) redirect("/prijava");
  return sesija;
}

export async function podaciZahtjeva(): Promise<{ ip: string; preglednik: string | null; protokol: string | null }> {
  const h = await headers();
  // postavlja ga samo naš poslužitelj (posluzitelj/ip.mjs) iz TCP veze ili pouzdanog proxyja
  const ip = h.get("x-erp-ip") || "nepoznat";
  return { ip, preglednik: h.get("user-agent"), protokol: h.get("x-forwarded-proto") };
}

/** Smije li kolačić imati „Secure“ (HTTPS ili prisilno postavljeno) — pravilo 11. */
export async function sigurnaVeza(): Promise<boolean> {
  const { protokol } = await podaciZahtjeva();
  return kolacicSecure(protokol, (process.env["KOLACIC_SECURE"] as NacinSecure | undefined) ?? "auto");
}

export async function postaviKolacicSesije(token: string): Promise<void> {
  const { protokol } = await podaciZahtjeva();
  const nacin = (process.env["KOLACIC_SECURE"] as NacinSecure | undefined) ?? "auto";
  (await cookies()).set(KOLACIC_SESIJE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: kolacicSecure(protokol, nacin),
    path: "/",
    maxAge: KOLACIC_MAX_SEKUNDI,
  });
}

export async function tokenIzKolacica(): Promise<string | null> {
  return (await cookies()).get(KOLACIC_SESIJE)?.value ?? null;
}

export async function obrisiKolacicSesije(): Promise<void> {
  (await cookies()).delete(KOLACIC_SESIJE);
}
