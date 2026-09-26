/**
 * Izvoz popisa (CSV, Excel, PDF) — zajednička definicija stupaca i pretvorba vrijednosti.
 */
import { formatirajIznos } from "@/domain/novac";

export type VrstaStupca = "tekst" | "iznos" | "broj" | "datum" | "vrijeme";

export type StupacIzvoza<R> = {
  naslov: string;
  vrsta?: VrstaStupca;
  /** nabavne cijene / marže — izbacuje se za korisnika bez prava */
  osjetljivo?: boolean;
  /** iznos: centi (number); datum: "YYYY-MM-DD"; vrijeme: Date */
  vrijednost: (red: R) => string | number | Date | null | undefined;
  sirina?: number;
};

export function dopusteniStupci<S extends { osjetljivo?: boolean | undefined }>(stupci: readonly S[], vidiNabavne: boolean): S[] {
  return stupci.filter((s) => vidiNabavne || !s.osjetljivo);
}

const vrijemeFormat = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

/** Vrijednost kao tekst za CSV/PDF (hrvatski zapis). */
export function tekstVrijednosti(v: string | number | Date | null | undefined, vrsta: VrstaStupca = "tekst"): string {
  if (v === null || v === undefined) return "";
  switch (vrsta) {
    case "iznos":
      return formatirajIznos(Number(v));
    case "broj":
      return typeof v === "number" ? v.toLocaleString("hr-HR") : String(v);
    case "datum": {
      const s = String(v);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}.` : s;
    }
    case "vrijeme":
      return v instanceof Date ? vrijemeFormat.format(v) : String(v);
    default:
      return v instanceof Date ? vrijemeFormat.format(v) : String(v);
  }
}

/** Zaštita od formula u Excelu (=, +, -, @ na početku ćelije iz korisničkog teksta). */
export function bezFormule(tekst: string): string {
  return /^[=+\-@\t\r]/.test(tekst) ? `'${tekst}` : tekst;
}
