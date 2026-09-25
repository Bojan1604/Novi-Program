/**
 * Prava — čista logika (bez baze).
 *
 * Svaki modul ima razinu: nema < pregled < operativno < puno.
 *  - pregled: gleda i izvozi
 *  - operativno: svakodnevni rad (unos, izmjena, izdavanje)
 *  - puno: brisanje, odobravanje, postavke modula
 * Posebna prava su neovisna o modulima.
 */

export const MODULI = {
  nadzorna: "Nadzorna ploča",
  uredaji: "Uređaji i skladište",
  sifrarnici: "Šifrarnici",
  partneri: "Partneri",
  prodaja: "Prodaja",
  najam: "Najam",
  nabava: "Nabava",
  troskovi: "Troškovi",
  knjigovodja: "Knjigovođa",
  servis: "Servis",
  portal: "Portal klijenata",
  mdm: "MDM",
  izvjestaji: "Izvještaji",
  postavke: "Postavke firme",
  korisnici: "Korisnici i prava",
} as const;
export type Modul = keyof typeof MODULI;
export const POPIS_MODULA = Object.keys(MODULI) as Modul[];

export const RAZINE = ["nema", "pregled", "operativno", "puno"] as const;
export type Razina = (typeof RAZINE)[number];
export const NAZIVI_RAZINA: Record<Razina, string> = {
  nema: "Nema",
  pregled: "Pregled",
  operativno: "Operativno",
  puno: "Puno",
};

export const POSEBNA = {
  costs: "Nabavne cijene i marže",
  log: "Dnevnik promjena",
  opasnaZona: "Opasna zona",
} as const;
export type Posebno = keyof typeof POSEBNA;
export const POPIS_POSEBNIH = Object.keys(POSEBNA) as Posebno[];

export type Prava = { moduli: Record<Modul, Razina>; posebna: Record<Posebno, boolean> };

/** Iznimke po korisniku: samo ono što se razlikuje od uloge. */
export type Iznimke = { moduli?: Partial<Record<Modul, Razina>>; posebna?: Partial<Record<Posebno, boolean>> };

export function razinaBroj(r: Razina): number {
  return RAZINE.indexOf(r);
}

export function jeRazina(v: unknown): v is Razina {
  return typeof v === "string" && (RAZINE as readonly string[]).includes(v);
}

export function praznaPrava(): Prava {
  return {
    moduli: Object.fromEntries(POPIS_MODULA.map((m) => [m, "nema"])) as Record<Modul, Razina>,
    posebna: Object.fromEntries(POPIS_POSEBNIH.map((p) => [p, false])) as Record<Posebno, boolean>,
  };
}

export function punaPrava(): Prava {
  return {
    moduli: Object.fromEntries(POPIS_MODULA.map((m) => [m, "puno"])) as Record<Modul, Razina>,
    posebna: Object.fromEntries(POPIS_POSEBNIH.map((p) => [p, true])) as Record<Posebno, boolean>,
  };
}

/**
 * Prava iz nepouzdanog izvora (JSON iz baze, obrazac): nepoznati moduli i
 * razine se odbacuju, a sve što nedostaje je „nema“ / false.
 */
export function procitajPrava(vrijednost: unknown): Prava {
  const p = praznaPrava();
  const v = (vrijednost ?? {}) as { moduli?: Record<string, unknown>; posebna?: Record<string, unknown> };
  for (const m of POPIS_MODULA) {
    const r = v.moduli?.[m];
    if (jeRazina(r)) p.moduli[m] = r;
  }
  for (const x of POPIS_POSEBNIH) p.posebna[x] = v.posebna?.[x] === true;
  return p;
}

export function procitajIznimke(vrijednost: unknown): Iznimke {
  const v = (vrijednost ?? {}) as { moduli?: Record<string, unknown>; posebna?: Record<string, unknown> };
  const iznimke: Iznimke = {};
  for (const m of POPIS_MODULA) {
    const r = v.moduli?.[m];
    if (jeRazina(r)) (iznimke.moduli ??= {})[m] = r;
  }
  for (const x of POPIS_POSEBNIH) {
    const b = v.posebna?.[x];
    if (typeof b === "boolean") (iznimke.posebna ??= {})[x] = b;
  }
  return iznimke;
}

/** Stvarna prava korisnika: prava uloge s iznimkama korisnika. */
export function efektivnaPrava(uloga: Prava, iznimke: Iznimke = {}): Prava {
  return {
    moduli: { ...uloga.moduli, ...iznimke.moduli },
    posebna: { ...uloga.posebna, ...iznimke.posebna },
  };
}

export function imaPravo(prava: Prava, modul: Modul, razina: Razina): boolean {
  return razinaBroj(prava.moduli[modul]) >= razinaBroj(razina);
}

export function imaPosebno(prava: Prava, posebno: Posebno): boolean {
  return prava.posebna[posebno];
}

/** Pravo koje traži akcija ili stranica: razina u modulu i/ili posebno pravo. */
export type PotrebnoPravo = { modul: Modul; razina: Razina; posebno?: Posebno } | { posebno: Posebno; modul?: undefined; razina?: undefined };

export function zadovoljava(prava: Prava, pravo: PotrebnoPravo): boolean {
  if (pravo.modul && !imaPravo(prava, pravo.modul, pravo.razina)) return false;
  if (pravo.posebno && !imaPosebno(prava, pravo.posebno)) return false;
  return true;
}

/** Ima li `a` sva prava koja ima `b` (i možda više). */
export function jeNadskup(a: Prava, b: Prava): boolean {
  return POPIS_MODULA.every((m) => razinaBroj(a.moduli[m]) >= razinaBroj(b.moduli[m])) && POPIS_POSEBNIH.every((x) => a.posebna[x] || !b.posebna[x]);
}

export function jeAdministrator(prava: Prava): boolean {
  return jeNadskup(prava, punaPrava());
}

export type OdlukaUpravljanja = { dopusteno: true } | { dopusteno: false; razlog: string };

/**
 * Smije li akter mijenjati korisnika (podatke, lozinku, isključenje) i dati mu nova prava.
 * - treba „Korisnici i prava“ na razini puno
 * - nitko ne mijenja vlastita prava (ni administrator — to radi drugi administrator)
 * - ne-administrator ne upravlja korisnikom koji ima prava koja on nema
 * - nitko ne dodjeljuje prava koja sam nema
 */
export function smijeUpravljati(akter: { id: string; prava: Prava }, cilj: { id: string; prava: Prava }, novaPrava?: Prava): OdlukaUpravljanja {
  if (!imaPravo(akter.prava, "korisnici", "puno")) {
    return { dopusteno: false, razlog: "Nemate pravo upravljati korisnicima." };
  }
  if (novaPrava && akter.id === cilj.id) {
    return { dopusteno: false, razlog: "Ne možete mijenjati vlastita prava." };
  }
  if (akter.id !== cilj.id && !jeNadskup(akter.prava, cilj.prava)) {
    return { dopusteno: false, razlog: "Ne možete upravljati korisnikom koji ima prava koja vi nemate." };
  }
  if (novaPrava && !jeNadskup(akter.prava, novaPrava)) {
    return { dopusteno: false, razlog: "Ne možete dodijeliti prava koja sami nemate." };
  }
  return { dopusteno: true };
}

/** Prava koja uloga smije imati nakon izmjene od strane aktera. */
export function smijeUrediti(akter: Prava, prava: Prava): OdlukaUpravljanja {
  if (!imaPravo(akter, "korisnici", "puno")) return { dopusteno: false, razlog: "Nemate pravo uređivati uloge." };
  if (!jeNadskup(akter, prava)) return { dopusteno: false, razlog: "Ne možete dodijeliti prava koja sami nemate." };
  return { dopusteno: true };
}

// ─── Zadane uloge (napravi se pri stvaranju firme) ─────────────────────────────

function pravaIz(moduli: Partial<Record<Modul, Razina>>, posebna: Partial<Record<Posebno, boolean>> = {}): Prava {
  const p = praznaPrava();
  return { moduli: { ...p.moduli, ...moduli }, posebna: { ...p.posebna, ...posebna } };
}

export const ULOGA_ADMINISTRATOR = "Administrator";

export const ZADANE_ULOGE: { naziv: string; opis: string; prava: Prava; sustavna?: boolean }[] = [
  { naziv: ULOGA_ADMINISTRATOR, opis: "Sva prava. Ne može se mijenjati ni brisati.", prava: punaPrava(), sustavna: true },
  {
    naziv: "Voditelj",
    opis: "Svakodnevni rad u svim modulima, izvještaji i nabavne cijene.",
    prava: pravaIz(
      {
        nadzorna: "pregled",
        uredaji: "puno",
        sifrarnici: "operativno",
        partneri: "puno",
        prodaja: "puno",
        najam: "puno",
        nabava: "puno",
        troskovi: "operativno",
        knjigovodja: "operativno",
        servis: "puno",
        portal: "operativno",
        mdm: "operativno",
        izvjestaji: "pregled",
        postavke: "pregled",
        korisnici: "pregled",
      },
      { costs: true, log: true },
    ),
  },
  {
    naziv: "Prodavač",
    opis: "Partneri, ponude, računi i ugovori o najmu.",
    prava: pravaIz({
      nadzorna: "pregled",
      uredaji: "pregled",
      sifrarnici: "pregled",
      partneri: "operativno",
      prodaja: "operativno",
      najam: "operativno",
      servis: "pregled",
      izvjestaji: "pregled",
    }),
  },
  {
    naziv: "Skladištar",
    opis: "Zaprimanje, uređaji, međuskladišnice, inventura i narudžbe.",
    prava: pravaIz({
      nadzorna: "pregled",
      uredaji: "operativno",
      sifrarnici: "pregled",
      partneri: "pregled",
      nabava: "operativno",
      servis: "pregled",
    }),
  },
  {
    naziv: "Serviser",
    opis: "Servisni nalozi, portal i MDM.",
    prava: pravaIz({
      nadzorna: "pregled",
      uredaji: "pregled",
      partneri: "pregled",
      servis: "operativno",
      portal: "pregled",
      mdm: "operativno",
    }),
  },
  {
    naziv: "Knjigovođa",
    opis: "Pregled računa i troškova, paketi za knjigovođu.",
    prava: pravaIz(
      {
        partneri: "pregled",
        prodaja: "pregled",
        najam: "pregled",
        nabava: "pregled",
        troskovi: "pregled",
        knjigovodja: "operativno",
        izvjestaji: "pregled",
      },
      { costs: true },
    ),
  },
];
