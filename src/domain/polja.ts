/**
 * Opis polja obrasca i stroga provjera unosa — čista logika, ista za sve šifrarnike.
 * Neispravan unos nikad ne postaje 0 ili prazno: vraća se poruka uz polje.
 */
import { jeDatum, procitajDatum } from "./datum";
import { jeUuid } from "./id";
import { procitajKpd } from "./kpd";
import { procitajIznos } from "./novac";
import { procitajOib } from "./oib";
import { jeEmail, normalizirajEmail } from "./prijava";

export type VrstaPolja = "tekst" | "dugiTekst" | "iznos" | "postotak" | "cijeli" | "kpd" | "oib" | "email" | "datum" | "odabir" | "kvacica";

export type Polje = {
  ime: string;
  oznaka: string;
  vrsta: VrstaPolja;
  obavezno?: boolean;
  /** najveća duljina teksta (zadano 200, dugi tekst 5000) */
  najvise?: number;
  /** granice za brojeve (za iznos u centima) */
  min?: number;
  max?: number;
  opis?: string;
  /** nabavne cijene / marže — vidi i mijenja samo korisnik s pravom „costs“ */
  osjetljivo?: boolean;
  /** odabir: stalne opcije; ili `izvor` = model iz kojeg se opcije učitavaju */
  opcije?: readonly { vrijednost: string; naziv: string }[];
  izvor?: string;
};

/** iznos: centi; postotak: stotinke postotka (25,5 % → 2550); datum: "YYYY-MM-DD" */
export type Vrijednost = string | number | boolean | null;

export type RezultatPolja = { ok: true; vrijednosti: Record<string, Vrijednost> } | { ok: false; polja: Record<string, string> };

export function procitajPolja(polja: readonly Polje[], ulaz: (ime: string) => string | null): RezultatPolja {
  const vrijednosti: Record<string, Vrijednost> = {};
  const greske: Record<string, string> = {};

  for (const p of polja) {
    const sirovo = ulaz(p.ime);
    if (p.vrsta === "kvacica") {
      vrijednosti[p.ime] = sirovo === "on" || sirovo === "true" || sirovo === "1";
      continue;
    }
    const tekst = (sirovo ?? "").trim();
    if (tekst === "") {
      if (p.obavezno) greske[p.ime] = `Upišite: ${p.oznaka.toLowerCase()}.`;
      vrijednosti[p.ime] = null;
      continue;
    }
    const r = procitajJedno(p, tekst);
    if (typeof r === "object" && r !== null && "greska" in r) greske[p.ime] = r.greska;
    else vrijednosti[p.ime] = r as Vrijednost;
  }
  return Object.keys(greske).length ? { ok: false, polja: greske } : { ok: true, vrijednosti };
}

function procitajJedno(p: Polje, tekst: string): Vrijednost | { greska: string } {
  switch (p.vrsta) {
    case "tekst":
    case "dugiTekst": {
      const najvise = p.najvise ?? (p.vrsta === "tekst" ? 200 : 5000);
      if (tekst.length > najvise) return { greska: `Najviše ${najvise} znakova.` };
      return p.vrsta === "tekst" ? tekst.replace(/\s+/g, " ") : tekst;
    }
    case "iznos": {
      const r = procitajIznos(tekst, { dopustiNegativno: (p.min ?? 0) < 0 });
      if (!r.ok) return { greska: r.greska };
      return granice(p, r.vrijednost, (n) => (n / 100).toLocaleString("hr-HR"));
    }
    case "postotak": {
      const r = procitajIznos(tekst.replace(/\s*%$/, ""), { dopustiNegativno: (p.min ?? 0) < 0 });
      if (!r.ok) return { greska: r.greska.replace("Iznos", "Postotak").replace("iznos", "postotak") };
      return granice({ ...p, min: p.min ?? 0, max: p.max ?? 100_000 }, r.vrijednost, (n) => `${(n / 100).toLocaleString("hr-HR")} %`);
    }
    case "cijeli": {
      if (!/^-?\d+$/.test(tekst.replace(/\./g, ""))) return { greska: "Upišite cijeli broj." };
      const n = Number(tekst.replace(/\./g, ""));
      if (!Number.isSafeInteger(n)) return { greska: "Broj je prevelik." };
      return granice(p, n, (x) => x.toLocaleString("hr-HR"));
    }
    case "kpd": {
      const r = procitajKpd(tekst);
      return r.ok ? r.vrijednost : { greska: r.greska };
    }
    case "oib": {
      const r = procitajOib(tekst);
      return r.ok ? r.vrijednost : { greska: r.greska };
    }
    case "email": {
      const e = normalizirajEmail(tekst);
      return jeEmail(e) ? e : { greska: "E-pošta nije ispravna." };
    }
    case "datum": {
      const r = procitajDatum(tekst);
      return r.ok && jeDatum(r.vrijednost) ? r.vrijednost : { greska: "Datum nije ispravan (npr. 25.09.2026.)." };
    }
    case "odabir":
      if (p.opcije && !p.opcije.some((o) => o.vrijednost === tekst)) return { greska: "Odaberite jednu od ponuđenih vrijednosti." };
      if (p.izvor && !jeUuid(tekst)) return { greska: "Neispravan odabir." };
      if (tekst.length > 100) return { greska: "Neispravan odabir." };
      return tekst;
    default:
      return { greska: "Nepoznata vrsta polja." };
  }
}

function granice(p: Polje, n: number, prikaz: (n: number) => string): number | { greska: string } {
  if (p.min !== undefined && n < p.min) return { greska: `Najmanje ${prikaz(p.min)}.` };
  if (p.max !== undefined && n > p.max) return { greska: `Najviše ${prikaz(p.max)}.` };
  return n;
}
