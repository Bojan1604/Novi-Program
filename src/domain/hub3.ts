/**
 * HUB3 2D barkod (PDF417) za plaćanje — podaci po standardu HUB-a (HRVHUB30).
 * Hrvatski znakovi se pretvaraju u osnovna slova (neki čitači banaka ne podržavaju ISO 8859-2).
 */

export type PodaciHub3 = {
  /** centi, > 0 */
  iznos: number;
  platitelj: { naziv: string; adresa: string; mjesto: string };
  primatelj: { naziv: string; adresa: string; mjesto: string };
  iban: string;
  /** npr. HR00 */
  model: string;
  pozivNaBroj: string;
  sifraNamjene: string;
  opis: string;
};

const ZAMJENE: Record<string, string> = { č: "c", ć: "c", đ: "d", š: "s", ž: "z", Č: "C", Ć: "C", Đ: "D", Š: "S", Ž: "Z" };

export function bezDijakritika(t: string): string {
  return t.replace(/[čćđšžČĆĐŠŽ]/g, (z) => ZAMJENE[z]!).replace(/[^\x20-\x7e]/g, "");
}

const polje = (t: string | null | undefined, n: number) => bezDijakritika((t ?? "").replace(/\s+/g, " ").trim()).slice(0, n);

/** IBAN: HR + 19 znamenki, ispravan kontrolni broj (mod 97). */
export function jeIban(iban: string): boolean {
  const t = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(t)) return false;
  if (t.startsWith("HR") && t.length !== 21) return false;
  const pomaknuto = t.slice(4) + t.slice(0, 4);
  const brojevi = pomaknuto.replace(/[A-Z]/g, (z) => String(z.charCodeAt(0) - 55));
  let ostatak = 0;
  for (const c of brojevi) ostatak = (ostatak * 10 + Number(c)) % 97;
  return ostatak === 1;
}

/** Poziv na broj za model HR00: brojčani dijelovi odvojeni crticom (npr. 12-2026). */
export function pozivNaBrojRacuna(redni: number, godina: number): string {
  return `${redni}-${godina}`;
}

export function hub3Tekst(p: PodaciHub3): string {
  if (!Number.isSafeInteger(p.iznos) || p.iznos <= 0) throw new Error("HUB3: iznos mora biti veći od 0.");
  const iban = p.iban.replace(/\s+/g, "").toUpperCase();
  if (!jeIban(iban)) throw new Error("HUB3: IBAN nije ispravan.");
  return [
    "HRVHUB30",
    "EUR",
    String(p.iznos).padStart(15, "0"),
    polje(p.platitelj.naziv, 30),
    polje(p.platitelj.adresa, 27),
    polje(p.platitelj.mjesto, 27),
    polje(p.primatelj.naziv, 25),
    polje(p.primatelj.adresa, 25),
    polje(p.primatelj.mjesto, 27),
    iban,
    polje(p.model, 4),
    polje(p.pozivNaBroj, 22),
    polje(p.sifraNamjene, 4),
    polje(p.opis, 35),
    "",
  ].join("\n");
}
