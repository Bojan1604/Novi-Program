/**
 * PDV i zbrojevi dokumenta — čista logika (korak 2.1).
 *
 * Iznosi su cijeli brojevi centi, količina u tisućinkama (1,5 h = 1500), postoci u stotinkama (25 % = 2500).
 * Pravila zaokruživanja (EN 16931 / eRačun):
 *  - iznos stavke = količina × cijena × (1 − popust stavke) × (1 − popust dokumenta), jednom zaokružen na cent;
 *  - PDV se računa po kategoriji na ZBROJ osnovica te kategorije (ne po stavci), zaokružen na cent;
 *  - zaokruživanje „pola od nule“ (0,5 → 1; −0,5 → −1), isto za storno i odobrenja.
 *
 * Tekstovi oslobođenja i kategorije MORA potvrditi knjigovođa prije puštanja u rad (vidi CLAUDE.md).
 */
import type { Centi } from "./novac";
import type { PdvStatus } from "./partner";

export type VrstaIsporuke = "ROBA" | "USLUGA";

/** Stope PDV-a u RH (stotinke postotka). */
export const STOPE_PDV = [2500, 1300, 500, 0] as const;

export type KodKategorije = "HR" | "EU_ROBA" | "EU_USLUGA" | "IZVOZ" | "TRECE_USLUGA" | "NIJE_U_SUSTAVU";

export type KategorijaPdv = {
  kod: KodKategorije;
  /** stotinke postotka */
  stopa: number;
  /** UNCL5305 kategorija za eRačun: S standardna, Z nulta, K unutar EU, AE prijenos obveze, G izvoz, O izvan oporezivanja, E oslobođeno */
  ublKod: "S" | "Z" | "K" | "AE" | "G" | "O" | "E";
  /** razlog oslobođenja (tekst na računu) i šifra za eRačun */
  oslobodjenje: { tekst: string; vatex: string | null } | null;
  naziv: string;
};

export const TEKSTOVI_OSLOBODJENJA = {
  EU_ROBA: "Oslobođeno PDV-a — isporuka dobara u drugu državu članicu EU (čl. 41. st. 1. toč. a) Zakona o PDV-u).",
  EU_USLUGA: "Prijenos porezne obveze — mjesto obavljanja usluge je u državi primatelja (čl. 17. st. 1. Zakona o PDV-u).",
  IZVOZ: "Oslobođeno PDV-a — izvoz dobara izvan EU (čl. 45. st. 1. toč. a) Zakona o PDV-u).",
  TRECE_USLUGA: "Nije predmet oporezivanja u RH — mjesto obavljanja usluge je izvan EU (čl. 17. st. 1. Zakona o PDV-u).",
  NIJE_U_SUSTAVU: "Obveznik nije u sustavu PDV-a prema čl. 90. st. 1. Zakona o PDV-u; PDV nije obračunat.",
} as const;

/** Napomena na računu kad firma obračunava PDV po naplaćenoj naknadi (čl. 125.i Zakona o PDV-u). */
export const TEKST_NAPLACENA_NAKNADA = "Obračun PDV-a prema naplaćenim naknadama.";

/**
 * Kategorija PDV-a stavke: ovisi o tome je li firma u sustavu PDV-a, o poreznom statusu kupca
 * (src/domain/partner.ts) i o tome je li isporuka roba ili usluga (najam je usluga).
 */
export function kategorijaPdv(p: { firmaUSustavuPdv: boolean; statusKupca: PdvStatus; vrsta: VrstaIsporuke; stopa: number }): KategorijaPdv {
  if (!p.firmaUSustavuPdv) {
    return {
      kod: "NIJE_U_SUSTAVU",
      stopa: 0,
      ublKod: "O",
      oslobodjenje: { tekst: TEKSTOVI_OSLOBODJENJA.NIJE_U_SUSTAVU, vatex: null },
      naziv: "Nije u sustavu PDV-a",
    };
  }
  if (p.statusKupca === "EU_OBVEZNIK") {
    return p.vrsta === "ROBA"
      ? {
          kod: "EU_ROBA",
          stopa: 0,
          ublKod: "K",
          oslobodjenje: { tekst: TEKSTOVI_OSLOBODJENJA.EU_ROBA, vatex: "VATEX-EU-IC" },
          naziv: "Isporuka u EU",
        }
      : {
          kod: "EU_USLUGA",
          stopa: 0,
          ublKod: "AE",
          oslobodjenje: { tekst: TEKSTOVI_OSLOBODJENJA.EU_USLUGA, vatex: "VATEX-EU-AE" },
          naziv: "Usluga u EU (prijenos obveze)",
        };
  }
  if (p.statusKupca === "TRECA_ZEMLJA") {
    return p.vrsta === "ROBA"
      ? { kod: "IZVOZ", stopa: 0, ublKod: "G", oslobodjenje: { tekst: TEKSTOVI_OSLOBODJENJA.IZVOZ, vatex: "VATEX-EU-G" }, naziv: "Izvoz" }
      : {
          kod: "TRECE_USLUGA",
          stopa: 0,
          ublKod: "O",
          oslobodjenje: { tekst: TEKSTOVI_OSLOBODJENJA.TRECE_USLUGA, vatex: "VATEX-EU-O" },
          naziv: "Usluga izvan EU",
        };
  }
  // domaći kupac i građanin iz EU: hrvatski PDV po stopi artikla
  const stopa = (STOPE_PDV as readonly number[]).includes(p.stopa) ? p.stopa : 2500;
  return { kod: "HR", stopa, ublKod: stopa > 0 ? "S" : "Z", oslobodjenje: null, naziv: `PDV ${stopa / 100} %` };
}

/** Ključ grupiranja za zbrojeve: ista kategorija i stopa. */
export function kljucKategorije(k: Pick<KategorijaPdv, "kod" | "stopa">): string {
  return `${k.kod}:${k.stopa}`;
}

/** Dijeljenje cijelih brojeva sa zaokruživanjem „pola od nule“. */
export function podijeliZaokruzi(brojnik: bigint, nazivnik: bigint): bigint {
  if (nazivnik <= 0n) throw new Error("Nazivnik mora biti pozitivan.");
  const negativan = brojnik < 0n;
  const a = negativan ? -brojnik : brojnik;
  const q = (a * 2n + nazivnik) / (2n * nazivnik);
  return negativan ? -q : q;
}

function uBroj(b: bigint): number {
  if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Iznos je prevelik.");
  return Number(b);
}

export type StavkaZaZbroj = {
  /** tisućinke (1 kom = 1000) */
  kolicina: number;
  /** jedinična cijena bez PDV-a, centi */
  cijena: Centi;
  /** popust stavke, stotinke postotka (0–10000) */
  popust: number;
  kategorija: Pick<KategorijaPdv, "kod" | "stopa">;
};

export type ZbrojKategorije = { kod: KodKategorije; stopa: number; osnovica: Centi; pdv: Centi };

export type Zbrojevi = {
  stavke: { bruto: Centi; popust: Centi; iznos: Centi }[];
  poKategoriji: ZbrojKategorije[];
  /** zbroj iznosa prije popusta */
  bruto: Centi;
  popust: Centi;
  osnovica: Centi;
  pdv: Centi;
  ukupno: Centi;
};

function provjeriPostotak(p: number, sto: string) {
  if (!Number.isInteger(p) || p < 0 || p > 10000) throw new Error(`${sto} mora biti između 0 i 100 %.`);
}

/** Zbrojevi dokumenta. `popustDokumenta` (stotinke %) se primjenjuje na svaku stavku. */
export function izracunaj(stavke: readonly StavkaZaZbroj[], popustDokumenta = 0): Zbrojevi {
  provjeriPostotak(popustDokumenta, "Popust dokumenta");
  const pd = BigInt(10000 - popustDokumenta);
  const izracunate = stavke.map((s) => {
    if (!Number.isSafeInteger(s.kolicina) || !Number.isSafeInteger(s.cijena))
      throw new Error("Količina i cijena moraju biti cijeli brojevi (tisućinke, centi).");
    provjeriPostotak(s.popust, "Popust stavke");
    const kc = BigInt(s.kolicina) * BigInt(s.cijena);
    const bruto = podijeliZaokruzi(kc, 1000n);
    const iznos = podijeliZaokruzi(kc * BigInt(10000 - s.popust) * pd, 1000n * 10000n * 10000n);
    return { bruto: uBroj(bruto), popust: uBroj(bruto - iznos), iznos: uBroj(iznos) };
  });
  const grupe = new Map<string, ZbrojKategorije>();
  stavke.forEach((s, i) => {
    const k = kljucKategorije(s.kategorija);
    const g = grupe.get(k) ?? { kod: s.kategorija.kod, stopa: s.kategorija.stopa, osnovica: 0, pdv: 0 };
    g.osnovica += izracunate[i]!.iznos;
    grupe.set(k, g);
  });
  const poKategoriji = [...grupe.values()]
    .map((g) => ({ ...g, pdv: uBroj(podijeliZaokruzi(BigInt(g.osnovica) * BigInt(g.stopa), 10000n)) }))
    .sort((a, b) => b.stopa - a.stopa || a.kod.localeCompare(b.kod));
  const zbroj = (l: number[]) => l.reduce((a, b) => a + b, 0);
  const osnovica = zbroj(poKategoriji.map((g) => g.osnovica));
  const pdv = zbroj(poKategoriji.map((g) => g.pdv));
  return {
    stavke: izracunate,
    poKategoriji,
    bruto: zbroj(izracunate.map((s) => s.bruto)),
    popust: zbroj(izracunate.map((s) => s.popust)),
    osnovica,
    pdv,
    ukupno: osnovica + pdv,
  };
}

/** Cijena bez PDV-a iz cijene s PDV-om (maloprodajni upis), zaokruženo na cent. */
export function cijenaBezPdv(sPdv: Centi, stopa: number): Centi {
  return uBroj(podijeliZaokruzi(BigInt(sPdv) * 10000n, BigInt(10000 + stopa)));
}

/** Napomene o PDV-u na dokumentu (bez ponavljanja): oslobođenja kategorija + obračun po naplaćenoj naknadi. */
export function napomenePdv(kategorije: readonly KategorijaPdv[], naplacenaNaknada: boolean): string[] {
  const r = [...new Set(kategorije.map((k) => k.oslobodjenje?.tekst).filter((t): t is string => !!t))];
  if (naplacenaNaknada && kategorije.some((k) => k.kod === "HR")) r.push(TEKST_NAPLACENA_NAKNADA);
  return r;
}

/** Kategorija PDV-a iz spremljenog koda stavke (za eRačun izdanog dokumenta). */
export function kategorijaPoKodu(kod: KodKategorije, stopa: number): KategorijaPdv {
  const p = { firmaUSustavuPdv: true, statusKupca: "DOMACI" as PdvStatus, vrsta: "USLUGA" as VrstaIsporuke, stopa };
  switch (kod) {
    case "NIJE_U_SUSTAVU":
      return kategorijaPdv({ ...p, firmaUSustavuPdv: false });
    case "EU_ROBA":
      return kategorijaPdv({ ...p, statusKupca: "EU_OBVEZNIK", vrsta: "ROBA" });
    case "EU_USLUGA":
      return kategorijaPdv({ ...p, statusKupca: "EU_OBVEZNIK" });
    case "IZVOZ":
      return kategorijaPdv({ ...p, statusKupca: "TRECA_ZEMLJA", vrsta: "ROBA" });
    case "TRECE_USLUGA":
      return kategorijaPdv({ ...p, statusKupca: "TRECA_ZEMLJA" });
    default:
      return kategorijaPdv(p);
  }
}
