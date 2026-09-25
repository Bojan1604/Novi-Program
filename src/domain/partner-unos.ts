/**
 * Provjera unosa partnera (obrazac) — čista logika.
 */
import { jeDrzava } from "./drzave";
import { jeUuid } from "./id";
import { procitajOib } from "./oib";
import { jePostanskiBrojHr, PDV_STATUSI, procitajEracunAdresu, procitajPdvBroj } from "./partner";
import { jeEmail, normalizirajEmail } from "./prijava";

export type UnosPartnera = {
  naziv: string;
  kupac: boolean;
  dobavljac: boolean;
  drzava: string;
  oib: string | null;
  pdvBroj: string | null;
  adresa: string | null;
  postanskiBroj: string | null;
  mjesto: string | null;
  email: string | null;
  telefon: string | null;
  eRacunAdresa: string | null;
  pdvStatus: string | null;
  rokPlacanjaDana: number;
  cjenikId: string | null;
  napomena: string | null;
};

type Rezultat = { ok: true; vrijednost: UnosPartnera } | { ok: false; polja: Record<string, string> };

export function procitajPartnera(ulaz: (ime: string) => string | null): Rezultat {
  const t = (ime: string) => (ulaz(ime) ?? "").trim();
  const prazno = (v: string) => (v === "" ? null : v);
  const greske: Record<string, string> = {};

  const naziv = t("naziv").replace(/\s+/g, " ");
  if (!naziv) greske["naziv"] = "Upišite naziv.";
  else if (naziv.length > 200) greske["naziv"] = "Najviše 200 znakova.";

  const kupac = ["on", "true", "1"].includes(t("kupac"));
  const dobavljac = ["on", "true", "1"].includes(t("dobavljac"));
  if (!kupac && !dobavljac) greske["kupac"] = "Partner je kupac, dobavljač ili oboje.";

  const drzava = (t("drzava") || "HR").toUpperCase();
  if (!jeDrzava(drzava)) greske["drzava"] = "Odaberite državu.";

  let oib: string | null = null;
  if (t("oib")) {
    if (drzava !== "HR") greske["oib"] = "OIB imaju samo hrvatski subjekti; za strane upišite PDV broj.";
    else {
      const r = procitajOib(t("oib"));
      if (r.ok) oib = r.vrijednost;
      else greske["oib"] = r.greska;
    }
  }

  let pdvBroj: string | null = null;
  if (t("pdvBroj")) {
    const r = procitajPdvBroj(t("pdvBroj"), drzava);
    if (r.ok) pdvBroj = r.vrijednost;
    else greske["pdvBroj"] = r.greska;
  }
  if (pdvBroj && drzava === "HR" && oib && pdvBroj !== `HR${oib}`) greske["pdvBroj"] = "Hrvatski PDV broj je HR + OIB partnera.";

  const postanskiBroj = prazno(t("postanskiBroj"));
  if (postanskiBroj && drzava === "HR" && !jePostanskiBrojHr(postanskiBroj)) greske["postanskiBroj"] = "Poštanski broj ima 5 znamenki (npr. 10000).";

  let email: string | null = null;
  if (t("email")) {
    const e = normalizirajEmail(t("email"));
    if (jeEmail(e)) email = e;
    else greske["email"] = "E-pošta nije ispravna.";
  }

  let eRacunAdresa: string | null = null;
  if (t("eRacunAdresa")) {
    const r = procitajEracunAdresu(t("eRacunAdresa"));
    if (r.ok) eRacunAdresa = r.vrijednost;
    else greske["eRacunAdresa"] = r.greska;
  }

  const pdvStatus = prazno(t("pdvStatus"));
  if (pdvStatus && !(pdvStatus in PDV_STATUSI)) greske["pdvStatus"] = "Odaberite porezni status.";

  let rokPlacanjaDana = 15;
  if (t("rokPlacanjaDana")) {
    const n = Number(t("rokPlacanjaDana"));
    if (!Number.isInteger(n) || n < 0 || n > 365) greske["rokPlacanjaDana"] = "Rok plaćanja je 0–365 dana.";
    else rokPlacanjaDana = n;
  }

  const cjenikId = prazno(t("cjenikId"));
  if (cjenikId && !jeUuid(cjenikId)) greske["cjenikId"] = "Neispravan cjenik.";

  const kratko = (ime: string, najvise: number) => {
    const v = prazno(t(ime));
    if (v && v.length > najvise) greske[ime] = `Najviše ${najvise} znakova.`;
    return v;
  };

  const vrijednost: UnosPartnera = {
    naziv,
    kupac,
    dobavljac,
    drzava,
    oib,
    pdvBroj,
    adresa: kratko("adresa", 200),
    postanskiBroj,
    mjesto: kratko("mjesto", 100),
    email,
    telefon: kratko("telefon", 50),
    eRacunAdresa,
    pdvStatus,
    rokPlacanjaDana,
    cjenikId,
    napomena: kratko("napomena", 2000),
  };
  return Object.keys(greske).length ? { ok: false, polja: greske } : { ok: true, vrijednost };
}
