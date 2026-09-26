/**
 * Stanja uređaja i JEDINO pravilo prijelaza — čista logika.
 * Svaka poslovna radnja (zaprimanje, prodaja, najam, servis…) mijenja stanje samo kroz `prijelaz`.
 */

export const STANJA = {
  U_DOLASKU: "U dolasku",
  NA_SKLADISTU: "Na skladištu",
  REZERVIRAN: "Rezerviran",
  PRODAN: "Prodan",
  U_NAJMU: "U najmu",
  NA_SERVISU: "Na servisu",
  OTPISAN: "Otpisan",
} as const;
export type Stanje = keyof typeof STANJA;
export const POPIS_STANJA = Object.keys(STANJA) as Stanje[];

type Radnja = {
  naziv: string;
  /** iz kojih stanja smije; null = uređaj još ne postoji (novi) */
  iz: readonly (Stanje | null)[];
  /** novo stanje; "prethodno" = stanje prije servisa */
  u: Stanje | "prethodno" | "isto";
  /** je li uređaj nakon radnje na skladištu (fizički kod nas) */
  naSkladistu: boolean | "isto";
};

export const RADNJE = {
  najava: { naziv: "najava dolaska", iz: [null], u: "U_DOLASKU", naSkladistu: false },
  zaprimanje: { naziv: "zaprimanje", iz: [null, "U_DOLASKU"], u: "NA_SKLADISTU", naSkladistu: true },
  rezervacija: { naziv: "rezervacija", iz: ["NA_SKLADISTU"], u: "REZERVIRAN", naSkladistu: true },
  otkazRezervacije: { naziv: "otkaz rezervacije", iz: ["REZERVIRAN"], u: "NA_SKLADISTU", naSkladistu: true },
  prodaja: { naziv: "prodaja", iz: ["NA_SKLADISTU", "REZERVIRAN", "U_NAJMU"], u: "PRODAN", naSkladistu: false },
  stornoProdaje: { naziv: "storno prodaje", iz: ["PRODAN"], u: "NA_SKLADISTU", naSkladistu: true },
  najam: { naziv: "davanje u najam", iz: ["NA_SKLADISTU", "REZERVIRAN"], u: "U_NAJMU", naSkladistu: false },
  povratIzNajma: { naziv: "povrat iz najma", iz: ["U_NAJMU"], u: "NA_SKLADISTU", naSkladistu: true },
  // uređaj koji je već kod klijenta (iz ranijeg ugovora ili otkupljen pa dan u najam) ulazi na ugovor bez povratka na skladište
  najamKodKlijenta: { naziv: "najam uređaja kod klijenta", iz: ["U_NAJMU", "PRODAN"], u: "U_NAJMU", naSkladistu: false },
  // servis zadržava lokaciju (uređaj iz najma nema skladište), a može se i upisati
  ulazNaServis: { naziv: "prijem na servis", iz: ["NA_SKLADISTU", "U_NAJMU", "PRODAN", "REZERVIRAN"], u: "NA_SERVISU", naSkladistu: "isto" },
  izlazSaServisa: { naziv: "završetak servisa", iz: ["NA_SERVISU"], u: "prethodno", naSkladistu: "isto" },
  otpis: { naziv: "otpis", iz: ["NA_SKLADISTU", "NA_SERVISU", "U_DOLASKU", "REZERVIRAN"], u: "OTPISAN", naSkladistu: false },
  ponistenjeOtpisa: { naziv: "poništenje otpisa", iz: ["OTPISAN"], u: "NA_SKLADISTU", naSkladistu: true },
  medjuskladisnica: { naziv: "premještaj u drugo skladište", iz: ["NA_SKLADISTU", "REZERVIRAN"], u: "isto", naSkladistu: true },
} as const satisfies Record<string, Radnja>;
export type VrstaRadnje = keyof typeof RADNJE;
export const POPIS_RADNJI = Object.keys(RADNJE) as VrstaRadnje[];

export type Prijelaz = { ok: true; novo: Stanje; naSkladistu: boolean | "isto" } | { ok: false; razlog: string };

/**
 * Smije li se radnja izvesti nad uređajem u stanju `trenutno` (null = uređaj ne postoji)
 * i koje je novo stanje. Kod završetka servisa uređaj se vraća u stanje prije servisa.
 */
export function prijelaz(radnja: VrstaRadnje, trenutno: Stanje | null, stanjePrijeServisa?: Stanje | null, serijski?: string): Prijelaz {
  const r: Radnja = RADNJE[radnja];
  const oznaka = serijski ? `Uređaj ${serijski}` : "Uređaj";
  if (!(r.iz as readonly (Stanje | null)[]).includes(trenutno)) {
    if (trenutno === null) return { ok: false, razlog: `${oznaka} ne postoji — prvo ga treba zaprimiti.` };
    if ((r.iz as readonly (Stanje | null)[]).includes(null) && r.iz.length === 1) {
      return { ok: false, razlog: `${oznaka} već postoji (${STANJA[trenutno]}).` };
    }
    return { ok: false, razlog: `${oznaka} je „${STANJA[trenutno]}“ — radnja „${r.naziv}“ nije moguća (moguća samo iz stanja: ${dopustena(r)}).` };
  }
  if (r.u === "prethodno") {
    const nazad = stanjePrijeServisa && stanjePrijeServisa !== "NA_SERVISU" ? stanjePrijeServisa : "NA_SKLADISTU";
    return { ok: true, novo: nazad, naSkladistu: nazad === "NA_SKLADISTU" || nazad === "REZERVIRAN" };
  }
  if (r.u === "isto") return { ok: true, novo: trenutno!, naSkladistu: r.naSkladistu };
  return { ok: true, novo: r.u, naSkladistu: r.naSkladistu };
}

function dopustena(r: Radnja): string {
  return r.iz
    .filter((s): s is Stanje => s !== null)
    .map((s) => `„${STANJA[s]}“`)
    .join(", ");
}

/** Serijski broj: bez razmaka na krajevima, velika slova (isti uređaj ne smije biti upisan dvaput). */
export function normalizirajSerijski(upis: string): string {
  return upis.trim().replace(/\s+/g, "").toUpperCase();
}

export function provjeriSerijski(upis: string): { ok: true; vrijednost: string } | { ok: false; greska: string } {
  const s = normalizirajSerijski(upis);
  if (!s) return { ok: false, greska: "Upišite serijski broj." };
  if (s.length < 3) return { ok: false, greska: `Serijski broj „${s}“ je prekratak.` };
  if (s.length > 60) return { ok: false, greska: "Serijski broj je predug (najviše 60 znakova)." };
  if (!/^[A-Z0-9\-_./#]+$/.test(s)) return { ok: false, greska: `Serijski broj „${s}“ sadrži nedopuštene znakove.` };
  return { ok: true, vrijednost: s };
}
