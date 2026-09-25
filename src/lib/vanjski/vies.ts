import { dohvatiJson, GreskaVanjska } from "./dohvat";

export type PodaciTvrtke = { naziv: string | null; adresa: string | null; postanskiBroj: string | null; mjesto: string | null };

/** Adresa iz VIES-a je tekst u više redaka („ULICA 1\n10000 ZAGREB“). */
export function razloziAdresu(tekst: string | null | undefined): Pick<PodaciTvrtke, "adresa" | "postanskiBroj" | "mjesto"> {
  const redovi = (tekst ?? "")
    .split(/\n|,/)
    .map((r) => r.trim())
    .filter((r) => r && r !== "---");
  if (redovi.length === 0) return { adresa: null, postanskiBroj: null, mjesto: null };
  const zadnji = redovi[redovi.length - 1]!;
  const m = /^(\d{4,6})\s+(.+)$/.exec(zadnji);
  if (m && redovi.length > 1) return { adresa: redovi.slice(0, -1).join(", "), postanskiBroj: m[1]!, mjesto: naslov(m[2]!) };
  return { adresa: redovi.join(", "), postanskiBroj: null, mjesto: null };
}

function naslov(t: string): string {
  return t.toLocaleLowerCase("hr").replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase("hr"));
}

export type OdgovorVies = { isValid?: boolean; valid?: boolean; name?: string; address?: string; userError?: string };

export function procitajVies(o: OdgovorVies | null): { valjan: boolean; podaci: PodaciTvrtke } {
  if (!o) return { valjan: false, podaci: { naziv: null, adresa: null, postanskiBroj: null, mjesto: null } };
  if (o.userError && !["VALID", "INVALID"].includes(o.userError)) {
    throw new GreskaVanjska("VIES trenutno ne može provjeriti broj (servis države članice nije dostupan). Pokušajte kasnije.");
  }
  const valjan = Boolean(o.isValid ?? o.valid);
  const naziv = o.name && o.name.trim() !== "---" ? o.name.trim() : null;
  return { valjan, podaci: { naziv, ...razloziAdresu(o.address) } };
}

/** Provjera PDV broja u VIES-u (EU). `pdvBroj` s prefiksom države, npr. „DE123456789“. */
export async function provjeriVies(pdvBroj: string): Promise<{ valjan: boolean; podaci: PodaciTvrtke }> {
  const drzava = pdvBroj.slice(0, 2);
  const broj = pdvBroj.slice(2);
  const o = (await dohvatiJson(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${drzava}/vat/${encodeURIComponent(broj)}`, {
    naziv: "VIES (EU registar PDV brojeva)",
    headers: { Accept: "application/json" },
  })) as OdgovorVies | null;
  return procitajVies(o);
}
