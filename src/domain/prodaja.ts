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

/** Kategorije PDV-a po stavci i zbrojevi — isti izračun u pregledniku (uživo) i na poslužitelju (spremanje). */
export function izracunajDokument(
  stavke: readonly UlaznaStavka[],
  p: { firmaUSustavuPdv: boolean; pdvPoNaplacenoj: boolean; statusKupca: PdvStatus; popust: number },
): IzracunatDokument {
  const pripremljene = stavke.map((s) => {
    const v = vrstaIsporuke(s);
    return {
      ...s,
      vrstaIsporuke: v,
      kategorija: kategorijaPdv({ firmaUSustavuPdv: p.firmaUSustavuPdv, statusKupca: p.statusKupca, vrsta: v, stopa: s.stopa }),
    };
  });
  const zbrojevi = izracunaj(
    pripremljene.map((s) => ({ kolicina: s.kolicina, cijena: s.cijena, popust: s.popust, kategorija: s.kategorija })),
    p.popust,
  );
  return {
    stavke: pripremljene.map((s, i) => ({ ...s, iznos: zbrojevi.stavke[i]!.iznos })),
    zbrojevi,
    napomene: napomenePdv(
      pripremljene.map((s) => s.kategorija),
      p.pdvPoNaplacenoj,
    ),
  };
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
