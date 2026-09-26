/**
 * Prodajni dokumenti — čista pravila: vrste, stavke, PDV po stavci i zbrojevi (preko src/domain/pdv.ts),
 * pretvaranje ponuda → predračun → račun.
 */
import type { PdvStatus } from "./partner";
import { izracunaj, kategorijaPdv, napomenePdv, STOPE_PDV, type KategorijaPdv, type VrstaIsporuke, type Zbrojevi } from "./pdv";

export const VRSTE_PRODAJE = {
  PONUDA: { naziv: "Ponuda", prefiks: "PON", brojac: "ponuda" },
  PREDRACUN: { naziv: "Predračun", prefiks: "PRED", brojac: "predracun" },
  RACUN: { naziv: "Račun", prefiks: "", brojac: "racun" },
  STORNO: { naziv: "Storno računa", prefiks: "", brojac: "racun" },
  ODOBRENJE: { naziv: "Odobrenje", prefiks: "", brojac: "racun" },
} as const;
export type VrstaProdaje = keyof typeof VRSTE_PRODAJE;

export function jeVrstaProdaje(v: unknown): v is VrstaProdaje {
  return typeof v === "string" && Object.hasOwn(VRSTE_PRODAJE, v);
}

/** Iz čega se smije napraviti što (sve se prenosi bez gubitka). */
export const PRETVORBE: Record<VrstaProdaje, VrstaProdaje[]> = {
  PONUDA: ["PREDRACUN", "RACUN"],
  PREDRACUN: ["RACUN"],
  RACUN: [],
  STORNO: [],
  ODOBRENJE: [],
};

export const VRSTE_STAVKI = { UREDAJ: "Uređaj", MODEL: "Model", USLUGA: "Usluga", RUCNA: "Ručna stavka" } as const;
export type VrstaStavke = keyof typeof VRSTE_STAVKI;
export type Namjena = "PRODAJA" | "NAJAM";

export type UlaznaStavka = {
  vrsta: VrstaStavke;
  namjena: Namjena;
  uredajId?: string | null;
  modelId?: string | null;
  uslugaId?: string | null;
  naziv: string;
  opis?: string | null;
  kpd?: string | null;
  jedinica: string;
  /** tisućinke */
  kolicina: number;
  /** centi, bez PDV-a */
  cijena: number;
  /** stotinke postotka */
  popust: number;
  /** stopa PDV-a artikla (za domaće kupce) */
  stopa: number;
  /** samo ručna stavka: roba ili usluga */
  vrstaIsporuke?: VrstaIsporuke;
  /** odobrenje: stavka izvornog računa */
  izvornaStavkaId?: string | null;
};

/** Roba ili usluga: prodaja uređaja/modela je roba, najam i usluge su usluga, ručna po izboru. */
export function vrstaIsporuke(s: Pick<UlaznaStavka, "vrsta" | "namjena" | "vrstaIsporuke">): VrstaIsporuke {
  if (s.vrsta === "USLUGA" || s.namjena === "NAJAM") return "USLUGA";
  if (s.vrsta === "RUCNA") return s.vrstaIsporuke ?? "ROBA";
  return "ROBA";
}

/** Provjera stavke za korisnika (null = u redu). Količina uređaja je uvijek 1 (jedan serijski broj). */
export function provjeriStavku(s: UlaznaStavka, i: number, dopustiNegativno = false): string | null {
  const r = `Stavka ${i + 1}`;
  if (!s.naziv.trim()) return `${r}: upišite naziv.`;
  if (s.naziv.length > 300) return `${r}: naziv je predug.`;
  if (!Number.isSafeInteger(s.kolicina) || s.kolicina === 0 || (!dopustiNegativno && s.kolicina < 0)) return `${r}: količina mora biti veća od 0.`;
  if (s.vrsta === "UREDAJ" && Math.abs(s.kolicina) !== 1000) return `${r}: uređaj sa serijskim brojem ima količinu 1.`;
  if (!Number.isSafeInteger(s.cijena) || s.cijena < 0) return `${r}: cijena nije ispravna.`;
  if (!Number.isInteger(s.popust) || s.popust < 0 || s.popust > 10000) return `${r}: popust mora biti između 0 i 100 %.`;
  if (!(STOPE_PDV as readonly number[]).includes(s.stopa)) return `${r}: stopa PDV-a nije ispravna.`;
  if (s.vrsta === "UREDAJ" && !s.uredajId) return `${r}: odaberite uređaj.`;
  if (s.vrsta === "MODEL" && !s.modelId) return `${r}: odaberite model.`;
  if (s.vrsta === "USLUGA" && !s.uslugaId) return `${r}: odaberite uslugu.`;
  return null;
}

export type IzracunatDokument = {
  stavke: (UlaznaStavka & { vrstaIsporuke: VrstaIsporuke; kategorija: KategorijaPdv; iznos: number })[];
  zbrojevi: Zbrojevi;
  napomene: string[];
};

export type GrupiranaStavka = UlaznaStavka & { uredajIds: string[]; serijski: string[] };

/**
 * „Isti model = jedna stavka s količinom“: uređaji istog modela, naziva, namjene, cijene, popusta, stope i KPD-a
 * spajaju se u jednu stavku (količina = broj uređaja, opis = serijski brojevi). Ostale stavke ostaju kakve jesu.
 * `serijski` (po uređaju, isti redoslijed kao ulaz) služi samo za opis.
 */
export function grupirajUredaje(stavke: readonly (UlaznaStavka & { serijskiBroj?: string | null })[]): GrupiranaStavka[] {
  const r: GrupiranaStavka[] = [];
  const grupe = new Map<string, GrupiranaStavka>();
  for (const s of stavke) {
    if (s.vrsta !== "UREDAJ" || !s.uredajId) {
      const { serijskiBroj: _s, ...ostalo } = s;
      r.push({ ...ostalo, uredajIds: [], serijski: [] });
      continue;
    }
    const kljuc = [s.modelId, s.naziv, s.namjena, s.cijena, s.popust, s.stopa, s.kpd ?? "", Math.sign(s.kolicina), s.izvornaStavkaId ?? ""].join("|");
    const g = grupe.get(kljuc);
    if (g) {
      g.kolicina += s.kolicina;
      g.uredajIds.push(s.uredajId);
      if (s.serijskiBroj) g.serijski.push(s.serijskiBroj);
      continue;
    }
    const { serijskiBroj, ...ostalo } = s;
    const nova: GrupiranaStavka = { ...ostalo, uredajId: null, uredajIds: [s.uredajId], serijski: serijskiBroj ? [serijskiBroj] : [] };
    grupe.set(kljuc, nova);
    r.push(nova);
  }
  for (const g of r) if (g.serijski.length) g.opis = `S/N: ${[...g.serijski].sort().join(", ")}`;
  return r;
}

/**
 * Kategorije PDV-a i zbrojevi — isti izračun u pregledniku (uživo) i na poslužitelju.
 * Zbrojevi se računaju na GRUPIRANIM stavkama (kako će biti na izdanom računu); `stavke` nose iznos
 * svake upisane stavke za prikaz u uređivaču.
 */
export function izracunajDokument(
  stavke: readonly (UlaznaStavka & { serijskiBroj?: string | null })[],
  p: { firmaUSustavuPdv: boolean; pdvPoNaplacenoj: boolean; statusKupca: PdvStatus; popust: number },
): IzracunatDokument & { grupirane: (GrupiranaStavka & { vrstaIsporuke: VrstaIsporuke; kategorija: KategorijaPdv; iznos: number })[] } {
  const pripremi = <T extends UlaznaStavka>(s: T) => {
    const v = vrstaIsporuke(s);
    return {
      ...s,
      vrstaIsporuke: v,
      kategorija: kategorijaPdv({ firmaUSustavuPdv: p.firmaUSustavuPdv, statusKupca: p.statusKupca, vrsta: v, stopa: s.stopa }),
    };
  };
  const zaZbroj = <T extends ReturnType<typeof pripremi>>(l: T[]) =>
    izracunaj(
      l.map((s) => ({ kolicina: s.kolicina, cijena: s.cijena, popust: s.popust, kategorija: s.kategorija })),
      p.popust,
    );
  const pojedinacne = stavke.map(pripremi);
  const grupirane = grupirajUredaje(stavke).map(pripremi);
  const poStavci = zaZbroj(pojedinacne);
  const zbrojevi = zaZbroj(grupirane);
  return {
    stavke: pojedinacne.map((s, i) => ({ ...s, iznos: poStavci.stavke[i]!.iznos })),
    grupirane: grupirane.map((s, i) => ({ ...s, iznos: zbrojevi.stavke[i]!.iznos })),
    zbrojevi,
    napomene: napomenePdv(
      pojedinacne.map((s) => s.kategorija),
      p.pdvPoNaplacenoj,
    ),
  };
}

/** Provjera prije izdavanja računa (KPD obavezan na eRačunu za svaku stavku). */
export function provjeriZaIzdavanje(stavke: readonly Pick<UlaznaStavka, "naziv" | "kpd">[]): string | null {
  const bez = stavke.map((s, i) => (!s.kpd || !/^\d{2}\.\d{2}\.\d{2}$/.test(s.kpd) ? `${i + 1}. ${s.naziv}` : null)).filter(Boolean);
  if (bez.length)
    return `Stavke bez ispravne KPD oznake (upišite je na modelu ili usluzi, ili na ručnoj stavci): ${bez.slice(0, 5).join("; ")}${bez.length > 5 ? " …" : ""}.`;
  return null;
}

/** Količina iz upisa („2“, „1,5“, „0,333“) → tisućinke; strogo: tekst ili više od 3 decimale = greška. */
export function procitajKolicinu(upis: string): { ok: true; vrijednost: number } | { ok: false; greska: string } {
  const t = upis.trim().replace(/\s/g, "");
  if (!/^-?\d{1,9}(,\d{1,3})?$/.test(t)) return { ok: false, greska: "Količina nije ispravna (npr. 2 ili 1,5)." };
  const [cijeli, dec = ""] = t.replace("-", "").split(",");
  const v = Number(cijeli) * 1000 + Number(dec.padEnd(3, "0"));
  return { ok: true, vrijednost: t.startsWith("-") ? -v : v };
}

export function formatirajKolicinu(tisucinke: number): string {
  const v = Math.abs(tisucinke);
  const cijeli = Math.floor(v / 1000);
  const dec = String(v % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${tisucinke < 0 ? "-" : ""}${cijeli.toLocaleString("hr-HR")}${dec ? `,${dec}` : ""}`;
}
