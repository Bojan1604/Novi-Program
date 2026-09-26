/**
 * E-pošta uz dokumente — čisti predlošci po vrsti (korak 2.9). Tekst se može promijeniti prije slanja.
 */

export const VRSTE_PORUKA = {
  PONUDA: "Ponuda",
  PREDRACUN: "Predračun",
  RACUN: "Račun",
  PLACEN: "Potvrda plaćanja",
  STORNO: "Storno računa",
  ODOBRENJE: "Odobrenje",
  PREDUJAM: "Račun za predujam",
} as const;
export type VrstaPoruke = keyof typeof VRSTE_PORUKA;

export type PodaciPoruke = {
  firma: string;
  kupac: string | null;
  broj: string;
  /** npr. „1.250,00 €“ */
  iznos: string;
  datum: string;
  dospijece: string | null;
  vrijediDo: string | null;
  iban: string | null;
  pozivNaBroj: string | null;
  /** broj izvornog računa (storno, odobrenje) */
  zaRacun: string | null;
};

/** Koji predložak odgovara dokumentu (plaćen račun → potvrda plaćanja). */
export function vrstaPoruke(vrsta: string, placen: boolean): VrstaPoruke {
  if (vrsta === "RACUN" && placen) return "PLACEN";
  return (Object.hasOwn(VRSTE_PORUKA, vrsta) ? vrsta : "RACUN") as VrstaPoruke;
}

export function predlozak(vrsta: VrstaPoruke, p: PodaciPoruke): { predmet: string; tijelo: string } {
  const pozdrav = p.kupac ? `Poštovani,` : "Poštovani,";
  const potpis = `\n\nLijep pozdrav,\n${p.firma}`;
  const placanje =
    p.iban && p.pozivNaBroj
      ? `\n\nPlaćanje: IBAN ${p.iban}, model HR00, poziv na broj ${p.pozivNaBroj}. Na PDF-u je i 2D kod za plaćanje mobilnim bankarstvom.`
      : "";
  switch (vrsta) {
    case "PONUDA":
      return {
        predmet: `Ponuda ${p.broj} — ${p.firma}`,
        tijelo: `${pozdrav}\n\nu privitku Vam šaljemo ponudu ${p.broj} u iznosu ${p.iznos}${p.vrijediDo ? `, koja vrijedi do ${p.vrijediDo}` : ""}.\n\nZa sva pitanja stojimo na raspolaganju.${potpis}`,
      };
    case "PREDRACUN":
      return {
        predmet: `Predračun ${p.broj} — ${p.firma}`,
        tijelo: `${pozdrav}\n\nu privitku Vam šaljemo predračun ${p.broj} u iznosu ${p.iznos}${p.dospijece ? ` s rokom plaćanja ${p.dospijece}` : ""}.${placanje}${potpis}`,
      };
    case "RACUN":
      return {
        predmet: `Račun ${p.broj} — ${p.firma}`,
        tijelo: `${pozdrav}\n\nu privitku Vam šaljemo račun ${p.broj} od ${p.datum} u iznosu ${p.iznos}${p.dospijece ? `, s dospijećem ${p.dospijece}` : ""}.${placanje}${potpis}`,
      };
    case "PLACEN":
      return {
        predmet: `Račun ${p.broj} je plaćen — ${p.firma}`,
        tijelo: `${pozdrav}\n\nzahvaljujemo na uplati. Račun ${p.broj} u iznosu ${p.iznos} je u cijelosti plaćen. Račun Vam šaljemo u privitku za evidenciju.${potpis}`,
      };
    case "STORNO":
      return {
        predmet: `Storno računa ${p.zaRacun ?? ""} (${p.broj}) — ${p.firma}`,
        tijelo: `${pozdrav}\n\nobavještavamo Vas da je račun ${p.zaRacun ?? ""} storniran dokumentom ${p.broj} u iznosu ${p.iznos}. Storno Vam šaljemo u privitku; molimo da ga proknjižite uz izvorni račun.${potpis}`,
      };
    case "ODOBRENJE":
      return {
        predmet: `Odobrenje ${p.broj} za račun ${p.zaRacun ?? ""} — ${p.firma}`,
        tijelo: `${pozdrav}\n\nu privitku Vam šaljemo odobrenje ${p.broj} u iznosu ${p.iznos} za račun ${p.zaRacun ?? ""}. Iznos odobrenja umanjuje Vaše dugovanje ili će Vam biti vraćen.${potpis}`,
      };
    case "PREDUJAM":
      return {
        predmet: `Račun za predujam ${p.broj} — ${p.firma}`,
        tijelo: `${pozdrav}\n\nu privitku Vam šaljemo račun za predujam ${p.broj} u iznosu ${p.iznos}. Uplaćeni predujam bit će odbijen na konačnom računu.${placanje}${potpis}`,
      };
  }
}

/** Adrese primatelja: jedna ili više odvojenih zarezom/točka-zarezom; sve moraju biti ispravne. */
export function procitajPrimatelje(upis: string): { ok: true; vrijednost: string[] } | { ok: false; greska: string } {
  const adrese = upis
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!adrese.length) return { ok: false, greska: "Upišite e-poštu primatelja." };
  if (adrese.length > 10) return { ok: false, greska: "Najviše 10 primatelja." };
  const kriva = adrese.find((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a));
  if (kriva) return { ok: false, greska: `E-pošta „${kriva}“ nije ispravna.` };
  return { ok: true, vrijednost: [...new Set(adrese)] };
}

/** mailto: poveznica kad SMTP nije postavljen (privitak korisnik doda sam). */
export function mailto(prima: string[], predmet: string, tijelo: string): string {
  return `mailto:${prima.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(predmet)}&body=${encodeURIComponent(tijelo)}`;
}
