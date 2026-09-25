import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Prava } from "@/domain/prava";
import { pravaClana } from "@/services/korisnici";
import type { Sesija } from "@/services/prijava";
import { AKCIJE, STRANICE, zadovoljava, type KljucAkcije, type PotrebnoPravo, type PutanjaStranice } from "./akcije-prava";
import { db, dbFirme } from "./db";
import { GreskaKorisniku, type Neuspjeh } from "./greske";
import { podaciZahtjeva, trenutnaSesija } from "./sesija";

export type Kontekst = {
  sesija: Sesija;
  korisnikId: string;
  firmaId: string;
  prava: Prava;
  ip: string | null;
  /** baza ograničena na firmu korisnika */
  db: ReturnType<typeof dbFirme>;
};

/** Prijavljeni korisnik s pravima u trenutnoj firmi (jednom po zahtjevu) ili null. */
export const trenutniKontekst = cache(async (): Promise<Kontekst | null> => {
  const sesija = await trenutnaSesija();
  if (!sesija) return null;
  const prava = await pravaClana(db, sesija.firma.id, sesija.korisnik.id);
  if (!prava) return null;
  const { ip } = await podaciZahtjeva();
  return { sesija, korisnikId: sesija.korisnik.id, firmaId: sesija.firma.id, prava, ip, db: dbFirme(sesija.firma.id) };
});

const NEMA_PRAVA: Neuspjeh = { ok: false, greska: "Nemate pravo na ovu radnju." };

/**
 * Omotač SVAKE server akcije: prijava + pravo na poslužitelju, zatim radnja.
 * Greške za korisnika (GreskaKorisniku) vraća kao { ok: false, greska }.
 *
 *   export async function spremi(fd: FormData) {
 *     return akcija("partneri.spremi", async (k) => { … return { ok: true }; });
 *   }
 */
export async function akcija<T>(kljuc: KljucAkcije, radnja: (k: Kontekst) => Promise<T>): Promise<T | Neuspjeh> {
  const k = await trenutniKontekst();
  if (!k) redirect("/prijava");
  if (!zadovoljava(k.prava, AKCIJE[kljuc])) return NEMA_PRAVA;
  try {
    return await radnja(k);
  } catch (greska) {
    if (greska instanceof GreskaKorisniku) return { ok: false, greska: greska.message };
    throw greska;
  }
}

/** Provjera za stranicu: bez prijave → prijava; bez prava → /nema-pristupa. */
export async function pristupStranici(putanja: PutanjaStranice, dodatno?: PotrebnoPravo): Promise<Kontekst> {
  const k = await trenutniKontekst();
  if (!k) redirect("/prijava");
  const { naziv: _naziv, ...pravo } = STRANICE[putanja];
  if (!zadovoljava(k.prava, pravo) || (dodatno && !zadovoljava(k.prava, dodatno))) {
    redirect("/nema-pristupa");
  }
  return k;
}

/** Provjera za API rutu: vraća kontekst ili gotov odgovor 401/403. */
export async function pristupApi(pravo: PotrebnoPravo): Promise<Kontekst | Response> {
  const k = await trenutniKontekst();
  if (!k) return Response.json({ greska: "Niste prijavljeni." }, { status: 401 });
  if (!zadovoljava(k.prava, pravo)) return Response.json({ greska: "Nemate pravo." }, { status: 403 });
  return k;
}
