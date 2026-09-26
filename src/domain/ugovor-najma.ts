/** Ugovor o najmu (korak 3.2): status i provjere upisa — čista logika. */

export const STATUSI_UGOVORA = {
  NA_CEKANJU: "Počinje kasnije",
  AKTIVAN: "Aktivan",
  ISTEKAO: "Istekao",
  OTKAZAN: "Otkazan",
} as const;
export type StatusUgovora = keyof typeof STATUSI_UGOVORA;

/** Status na dan (datumi YYYY-MM-DD): otkazan ima prednost, zatim kraj, zatim početak. */
export function statusUgovora(u: { od: string; do: string | null; otkazan: string | null }, danas: string): StatusUgovora {
  if (u.otkazan && u.otkazan < danas) return "OTKAZAN";
  if (u.do && u.do < danas) return "ISTEKAO";
  if (u.od > danas) return "NA_CEKANJU";
  return "AKTIVAN";
}

const RE_DATUM = /^\d{4}-\d{2}-\d{2}$/;

export type UnosUgovora = {
  od: string;
  do: string | null;
  /** ručni broj (npr. s papirnatog ugovora); null = iz brojača */
  rucniBroj: string | null;
  rokPlacanjaDana: number;
  nacinPlacanja: string;
};

/** Greške po poljima (prazno = u redu). */
export function provjeriUgovor(u: UnosUgovora): Record<string, string> {
  const g: Record<string, string> = {};
  if (!RE_DATUM.test(u.od)) g["od"] = "Upišite početak ugovora.";
  if (u.do !== null && !RE_DATUM.test(u.do)) g["do"] = "Datum kraja nije ispravan.";
  else if (u.do !== null && RE_DATUM.test(u.od) && u.do < u.od) g["do"] = "Kraj ne može biti prije početka.";
  if (u.rucniBroj !== null) {
    const b = u.rucniBroj.trim();
    if (!b) g["broj"] = "Upišite broj ili ostavite prazno za automatski.";
    else if (b.length > 40) g["broj"] = "Broj je predug (najviše 40 znakova).";
    else if (!/^[\p{L}\p{N}\-/._ ]+$/u.test(b)) g["broj"] = "Broj smije sadržavati slova, brojke i znakove - / . _";
  }
  if (!Number.isInteger(u.rokPlacanjaDana) || u.rokPlacanjaDana < 0 || u.rokPlacanjaDana > 365) g["rokPlacanjaDana"] = "Rok plaćanja: 0–365 dana.";
  if (!["T", "G", "K", "O"].includes(u.nacinPlacanja)) g["nacinPlacanja"] = "Odaberite način plaćanja.";
  return g;
}

/** Automatski broj ugovora: NU-7/2026. */
export function brojUgovora(redni: number, godina: number): string {
  return `NU-${redni}/${godina}`;
}
