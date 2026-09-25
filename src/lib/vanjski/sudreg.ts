import { dohvatiJson, GreskaVanjska } from "./dohvat";
import type { PodaciTvrtke } from "./vies";

/**
 * Sudski registar (otvoreni podaci, sudreg-data.gov.hr). Traži pristupne podatke koje firma
 * dobije registracijom na data.gov.hr: SUDREG_CLIENT_ID i SUDREG_CLIENT_SECRET u .env.
 */
export function sudregPodesen(): boolean {
  return Boolean(process.env["SUDREG_CLIENT_ID"] && process.env["SUDREG_CLIENT_SECRET"]);
}

const OSNOVA = "https://sudreg-data.gov.hr/api";

async function token(): Promise<string> {
  const id = process.env["SUDREG_CLIENT_ID"] ?? "";
  const tajna = process.env["SUDREG_CLIENT_SECRET"] ?? "";
  const o = (await dohvatiJson(`${OSNOVA}/oauth/token`, {
    naziv: "Sudski registar",
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${tajna}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  })) as { access_token?: string } | null;
  if (!o?.access_token)
    throw new GreskaVanjska("Sudski registar nije prihvatio pristupne podatke (provjerite SUDREG_CLIENT_ID i SUDREG_CLIENT_SECRET).");
  return o.access_token;
}

type Objekt = Record<string, unknown>;
const tekst = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Odgovor „detalji subjekta“ → podaci tvrtke (tolerantno na nazive polja). */
export function procitajSudreg(o: Objekt | null): PodaciTvrtke | null {
  if (!o) return null;
  const tvrtka = (o["tvrtka"] ?? o["tvrtke"]) as Objekt | Objekt[] | undefined;
  const prva = Array.isArray(tvrtka) ? tvrtka[0] : tvrtka;
  const naziv = tekst(prva?.["ime"]) ?? tekst(prva?.["naziv"]) ?? tekst(o["naziv"]) ?? tekst(o["ime"]);
  const sjediste = (Array.isArray(o["sjediste"]) ? (o["sjediste"] as Objekt[])[0] : o["sjediste"]) as Objekt | undefined;
  const ulica = tekst(sjediste?.["ulica"]);
  const broj = tekst(sjediste?.["kucni_broj"]);
  const dodatak = tekst(sjediste?.["kucni_podbroj"]);
  const mjesto = tekst(sjediste?.["naziv_naselja"]) ?? tekst(sjediste?.["naselje"]) ?? tekst(sjediste?.["mjesto"]);
  const postanski = tekst(sjediste?.["postanski_broj"]) ?? tekst(sjediste?.["sifra_posta"]);
  return {
    naziv,
    adresa: ulica ? [ulica, [broj, dodatak].filter(Boolean).join("")].filter(Boolean).join(" ") : null,
    postanskiBroj: postanski,
    mjesto,
  };
}

export async function dohvatiIzSudregistra(oib: string): Promise<PodaciTvrtke | null> {
  if (!sudregPodesen()) throw new GreskaVanjska("Dohvat iz sudskog registra nije podešen (SUDREG_CLIENT_ID i SUDREG_CLIENT_SECRET).");
  const t = await token();
  const o = (await dohvatiJson(`${OSNOVA}/javni/detalji_subjekta?tip_identifikatora=oib&identifikator=${oib}`, {
    naziv: "Sudski registar",
    headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
  })) as Objekt | null;
  return procitajSudreg(o);
}
