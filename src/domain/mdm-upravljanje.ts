import type { Platforma } from "./mdm";

/**
 * MDM upravljanje (korak 5.6) — čista pravila: naredbe, profili (konfiguracije), aplikacije i nove verzije.
 */
export const VRSTE_NAREDBI = {
  ZAKLJUCAJ: { naziv: "Zaključaj zaslon", platforme: ["ANDROID", "WINDOWS"], puno: false },
  PONOVNO_POKRENI: { naziv: "Ponovno pokreni", platforme: ["ANDROID", "WINDOWS"], puno: false },
  SNIMI_ZASLON: { naziv: "Snimka zaslona", platforme: ["WINDOWS"], puno: false },
  PORUKA: { naziv: "Poruka na zaslonu", platforme: ["ANDROID", "WINDOWS"], puno: false },
  POSALJI_ZAPISNIK: { naziv: "Pošalji zapisnik", platforme: ["ANDROID", "WINDOWS"], puno: false },
  INSTALIRAJ: { naziv: "Instaliraj aplikaciju", platforme: ["ANDROID", "WINDOWS"], puno: false },
  DEINSTALIRAJ: { naziv: "Ukloni aplikaciju", platforme: ["ANDROID", "WINDOWS"], puno: false },
  OBRISI_PODATKE: { naziv: "Vrati na tvorničke postavke (briše sve)", platforme: ["ANDROID", "WINDOWS"], puno: true },
} as const satisfies Record<string, { naziv: string; platforme: readonly Platforma[]; puno: boolean }>;
export type VrstaNaredbe = keyof typeof VRSTE_NAREDBI;
export const STATUSI_NAREDBI = { CEKA: "Čeka", POSLANA: "Poslana", IZVRSENA: "Izvršena", GRESKA: "Greška", OTKAZANA: "Otkazana" } as const;
export type StatusNaredbe = keyof typeof STATUSI_NAREDBI;

export function jeVrstaNaredbe(v: unknown): v is VrstaNaredbe {
  return typeof v === "string" && Object.hasOwn(VRSTE_NAREDBI, v);
}

/** Smije li se naredba poslati uređaju te platforme i s kojim parametrima. */
export function provjeriNaredbu(
  vrsta: string,
  platforma: Platforma,
  parametri: Record<string, unknown>,
): { ok: true; vrsta: VrstaNaredbe; parametri: Record<string, string> } | { ok: false; greska: string } {
  if (!jeVrstaNaredbe(vrsta)) return { ok: false, greska: "Nepoznata naredba." };
  const n = VRSTE_NAREDBI[vrsta];
  if (!(n.platforme as readonly string[]).includes(platforma))
    return { ok: false, greska: `„${n.naziv}“ nije podržano na ${platforma === "ANDROID" ? "Androidu" : "Windowsu"}.` };
  if (vrsta === "PORUKA") {
    const t = typeof parametri["tekst"] === "string" ? parametri["tekst"].trim() : "";
    if (!t || t.length > 500) return { ok: false, greska: "Upišite poruku (do 500 znakova)." };
    return { ok: true, vrsta, parametri: { tekst: t } };
  }
  if (vrsta === "DEINSTALIRAJ") {
    const p = typeof parametri["paket"] === "string" ? parametri["paket"].trim() : "";
    if (!/^[\w.{}\-]{2,200}$/.test(p)) return { ok: false, greska: "Upišite paket aplikacije." };
    return { ok: true, vrsta, parametri: { paket: p } };
  }
  if (vrsta === "INSTALIRAJ") {
    const a = typeof parametri["aplikacijaId"] === "string" ? parametri["aplikacijaId"] : "";
    if (!/^[0-9a-f-]{36}$/i.test(a)) return { ok: false, greska: "Odaberite aplikaciju." };
    return { ok: true, vrsta, parametri: { aplikacijaId: a } };
  }
  return { ok: true, vrsta, parametri: {} };
}

// ——— profili ———

export type PostavkeProfila = {
  /** najmanja duljina lozinke/PIN-a zaslona (null = bez zahtjeva) */
  lozinkaMin: number | null;
  /** automatsko zaključavanje nakon minuta neaktivnosti */
  zakljucajNakonMin: number | null;
  kameraDopustena: boolean;
  usbDopusten: boolean;
  /** Wi-Fi mreža (lozinka se sprema šifrirana, ne prikazuje se) */
  wifiSsid: string | null;
  /** jedna aplikacija u načinu kioska (paket) */
  kiosk: string | null;
};

const broj = (v: unknown, od: number, doB: number): number | null | "greska" => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) && n >= od && n <= doB ? n : "greska";
};

export function procitajPostavke(u: Record<string, unknown>): { ok: true; vrijednost: PostavkeProfila } | { ok: false; greska: string } {
  const lozinkaMin = broj(u["lozinkaMin"], 4, 16);
  if (lozinkaMin === "greska") return { ok: false, greska: "Duljina lozinke zaslona: 4–16." };
  const zakljucajNakonMin = broj(u["zakljucajNakonMin"], 1, 60);
  if (zakljucajNakonMin === "greska") return { ok: false, greska: "Zaključavanje nakon: 1–60 minuta." };
  const ssid = typeof u["wifiSsid"] === "string" ? u["wifiSsid"].trim() : "";
  if (ssid.length > 32) return { ok: false, greska: "Naziv Wi-Fi mreže (SSID) ima najviše 32 znaka." };
  const kiosk = typeof u["kiosk"] === "string" ? u["kiosk"].trim() : "";
  if (kiosk && !/^[\w.]{2,200}$/.test(kiosk)) return { ok: false, greska: "Paket aplikacije za kiosk nije ispravan." };
  return {
    ok: true,
    vrijednost: {
      lozinkaMin,
      zakljucajNakonMin,
      kameraDopustena: u["kameraDopustena"] !== false,
      usbDopusten: u["usbDopusten"] !== false,
      wifiSsid: ssid || null,
      kiosk: kiosk || null,
    },
  };
}

/** Važeći profil uređaja: najbliži u lancu organizacija (uređaj → nadređena), pa opći (bez organizacije). */
export function vazeciProfil<P extends { organizacijaId: string | null; platforma: string; aktivan: boolean }>(
  profili: readonly P[],
  lanac: readonly string[],
  platforma: Platforma,
): P | null {
  const za = profili.filter((p) => p.aktivan && p.platforma === platforma);
  for (const o of lanac) {
    const p = za.find((x) => x.organizacijaId === o);
    if (p) return p;
  }
  return za.find((x) => x.organizacijaId === null) ?? null;
}

// ——— aplikacije ———

export type Aplikacija = { id: string; paket: string; platforma: string; verzijaKod: number };

/** Najnovija verzija svake dodijeljene aplikacije za platformu (dodjela na organizaciju vrijedi i za podređene). */
export function zeljeneAplikacije<A extends Aplikacija>(
  dodjele: readonly { organizacijaId: string; paket: string; platforma: string }[],
  aplikacije: readonly A[],
  lanac: readonly string[],
  platforma: Platforma,
): A[] {
  const paketi = new Set(dodjele.filter((d) => d.platforma === platforma && lanac.includes(d.organizacijaId)).map((d) => d.paket));
  const r: A[] = [];
  for (const p of paketi) {
    const zadnja = aplikacije.filter((a) => a.paket === p && a.platforma === platforma).sort((a, b) => b.verzijaKod - a.verzijaKod)[0];
    if (zadnja) r.push(zadnja);
  }
  return r.sort((a, b) => a.paket.localeCompare(b.paket));
}

/** Instalirane aplikacije koje agent javlja: [{ paket, verzijaKod }] — neispravno se preskače. */
export function instaliraneIzIzvjestaja(izvjestaj: unknown): Map<string, number> {
  const m = new Map<string, number>();
  const l = izvjestaj && typeof izvjestaj === "object" ? (izvjestaj as Record<string, unknown>)["aplikacije"] : null;
  if (!Array.isArray(l)) return m;
  for (const x of l) {
    if (!x || typeof x !== "object") continue;
    const { paket, verzijaKod } = x as Record<string, unknown>;
    if (typeof paket === "string" && typeof verzijaKod === "number" && Number.isFinite(verzijaKod)) m.set(paket, verzijaKod);
  }
  return m;
}

/** Aplikacije za instalaciju: nema je ili je starija, i već ne čeka instalacija te verzije. */
export function potrebneInstalacije<A extends Aplikacija>(zeljene: readonly A[], instalirane: Map<string, number>, cekaju: ReadonlySet<string>): A[] {
  return zeljene.filter((a) => (instalirane.get(a.paket) ?? -1) < a.verzijaKod && !cekaju.has(a.id));
}

/** Lanac organizacija od uređajeve prema vrhu (za nasljeđivanje profila i aplikacija). */
export function lanacOrganizacija(sve: readonly { id: string; nadredenaId: string | null }[], od: string): string[] {
  const r: string[] = [];
  let x: string | null = od;
  while (x && !r.includes(x)) {
    r.push(x);
    x = sve.find((o) => o.id === x)?.nadredenaId ?? null;
  }
  return r;
}
