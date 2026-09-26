/**
 * MDM (korak 5.5) — čista pravila: kod upisa, provjera podataka agenta, vidljivost organizacija.
 */
export const VRSTE_ORGANIZACIJA = { DISTRIBUTER: "Distributer", KLIJENT: "Klijent" } as const;
export type VrstaOrganizacije = keyof typeof VRSTE_ORGANIZACIJA;
export const PLATFORME = { ANDROID: "Android", WINDOWS: "Windows" } as const;
export type Platforma = keyof typeof PLATFORME;

/** bez znakova koji se lako zamijene (0/O, 1/I/L) */
const ZNAKOVI_KODA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Kod upisa: 12 znakova u tri skupine (XXXX-XXXX-XXXX) — ~59 bita, pogađanje nije izvedivo. */
export function kodUpisa(slucajniBajtovi: Uint8Array): string {
  if (slucajniBajtovi.length < 12) throw new Error("Premalo slučajnih bajtova.");
  const z = Array.from(slucajniBajtovi.slice(0, 12), (b) => ZNAKOVI_KODA[b % ZNAKOVI_KODA.length]).join("");
  return `${z.slice(0, 4)}-${z.slice(4, 8)}-${z.slice(8, 12)}`;
}

/** Upis s tipkovnice: mala slova, razmaci i crtice su dopušteni. */
export function normalizirajKod(upis: string): string | null {
  const c = upis.toUpperCase().replace(/[\s-]/g, "");
  if (c.length !== 12 || [...c].some((z) => !ZNAKOVI_KODA.includes(z))) return null;
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

export type PodaciUpisa = {
  kod: string;
  serijski: string;
  platforma: Platforma;
  naziv: string | null;
  model: string | null;
  osVerzija: string | null;
  verzijaAgenta: string | null;
};

const tekst = (v: unknown, najvise: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, najvise) : null);

/** Provjera tijela zahtjeva agenta pri upisu (agent je vanjski — ništa se ne vjeruje). */
export function procitajUpis(tijelo: unknown): { ok: true; vrijednost: PodaciUpisa } | { ok: false; greska: string } {
  if (!tijelo || typeof tijelo !== "object") return { ok: false, greska: "Neispravan zahtjev." };
  const t = tijelo as Record<string, unknown>;
  const kod = typeof t["kod"] === "string" ? normalizirajKod(t["kod"]) : null;
  if (!kod) return { ok: false, greska: "Kod upisa nije ispravan." };
  const serijski = tekst(t["serijski"], 60)?.toUpperCase().replace(/\s+/g, "");
  if (!serijski || !/^[A-Z0-9\-_./#:]{3,60}$/.test(serijski)) return { ok: false, greska: "Serijski broj nije ispravan." };
  const platforma = t["platforma"];
  if (platforma !== "ANDROID" && platforma !== "WINDOWS") return { ok: false, greska: "Platforma mora biti ANDROID ili WINDOWS." };
  return {
    ok: true,
    vrijednost: {
      kod,
      serijski,
      platforma,
      naziv: tekst(t["naziv"], 100),
      model: tekst(t["model"], 100),
      osVerzija: tekst(t["osVerzija"], 50),
      verzijaAgenta: tekst(t["verzijaAgenta"], 30),
    },
  };
}

export type CvorOrganizacije = { id: string; nadredenaId: string | null; partnerId: string | null };

/**
 * Organizacije koje vidi partner (distributer ili klijent na portalu): one kojima je partner vlasnik i sve ispod njih.
 * Otporno na petlje u podacima.
 */
export function vidljiveOrganizacije(sve: readonly CvorOrganizacije[], partnerId: string): Set<string> {
  const djeca = new Map<string, string[]>();
  for (const o of sve) if (o.nadredenaId) djeca.set(o.nadredenaId, [...(djeca.get(o.nadredenaId) ?? []), o.id]);
  const vidi = new Set<string>();
  const red = sve.filter((o) => o.partnerId === partnerId).map((o) => o.id);
  while (red.length) {
    const id = red.pop()!;
    if (vidi.has(id)) continue;
    vidi.add(id);
    red.push(...(djeca.get(id) ?? []));
  }
  return vidi;
}

/** Nadređena mora biti distributer, klijent nema podređenih, i bez petlji (organizacija ne može biti pod sobom). */
export function provjeriNadredenu(
  sve: readonly (CvorOrganizacije & { vrsta: string })[],
  id: string | null,
  vrsta: VrstaOrganizacije,
  nadredenaId: string | null,
): string | null {
  if (!nadredenaId) return null;
  const n = sve.find((o) => o.id === nadredenaId);
  if (!n) return "Nadređena organizacija ne postoji.";
  if (n.vrsta !== "DISTRIBUTER") return "Nadređena organizacija mora biti distributer.";
  if (vrsta === "DISTRIBUTER" && n.nadredenaId) return "Distributer može biti samo pod distributerom najviše razine.";
  if (id) {
    let x: string | null = nadredenaId;
    const vidjeni = new Set<string>();
    while (x && !vidjeni.has(x)) {
      if (x === id) return "Organizacija ne može biti pod samom sobom.";
      vidjeni.add(x);
      x = sve.find((o) => o.id === x)?.nadredenaId ?? null;
    }
  }
  return null;
}

/** Uređaj je „na vezi“ ako se javio u zadnjih 15 min. */
export function naVezi(zadnjiKontakt: Date | null, sada: Date): boolean {
  return !!zadnjiKontakt && sada.getTime() - zadnjiKontakt.getTime() <= 15 * 60_000;
}
