import type { Polje } from "@/domain/polja";

/**
 * Definicije šifrarnika — jedno mjesto za obrazac, popis, provjeru, dnevnik i brisanje.
 * Novi šifrarnik = novi unos ovdje + model u shemi (s poljima naziv, aktivan, firmaId).
 */
export type Referenca = { model: string; polje: string; naziv: string };

export type DefinicijaSifrarnika = {
  kljuc: string;
  /** ime Prisma delegata (prisma.<model>) */
  model: "kategorija" | "proizvodjac" | "modelUredaja" | "skladiste" | "stanjeRobe" | "usluga";
  entitet: string;
  naslov: string;
  jednina: string;
  opis: string;
  polja: Polje[];
  /** naziv je jedinstven unutar ovih polja (npr. model unutar proizvođača) */
  jedinstvenoUnutar?: string[];
  /** stupci popisa (imena polja) */
  stupci: string[];
  /** gdje se zapis koristi — brisanje samo ako se nigdje ne koristi */
  reference: Referenca[];
  /** samo jedan zapis smije imati ovo polje = true (npr. zadano skladište) */
  jedinstvenaKvacica?: string;
};

const NAZIV: Polje = { ime: "naziv", oznaka: "Naziv", vrsta: "tekst", obavezno: true, najvise: 120 };

export const SIFRARNICI: DefinicijaSifrarnika[] = [
  {
    kljuc: "kategorije",
    model: "kategorija",
    entitet: "Kategorija",
    naslov: "Kategorije",
    jednina: "Kategorija",
    opis: "Vrste uređaja: prijenosno računalo, monitor, pisač…",
    polja: [NAZIV],
    stupci: ["naziv"],
    reference: [{ model: "modelUredaja", polje: "kategorijaId", naziv: "modela" }],
  },
  {
    kljuc: "proizvodjaci",
    model: "proizvodjac",
    entitet: "Proizvodjac",
    naslov: "Proizvođači",
    jednina: "Proizvođač",
    opis: "Lenovo, HP, Dell…",
    polja: [NAZIV],
    stupci: ["naziv"],
    reference: [{ model: "modelUredaja", polje: "proizvodjacId", naziv: "modela" }],
  },
  {
    kljuc: "modeli",
    model: "modelUredaja",
    entitet: "ModelUredaja",
    naslov: "Modeli",
    jednina: "Model",
    opis: "Model uređaja s KPD oznakama, jamstvom i preporučenom cijenom.",
    polja: [
      { ime: "proizvodjacId", oznaka: "Proizvođač", vrsta: "odabir", izvor: "proizvodjac", obavezno: true },
      NAZIV,
      { ime: "kategorijaId", oznaka: "Kategorija", vrsta: "odabir", izvor: "kategorija", obavezno: true },
      { ime: "sifra", oznaka: "Šifra", vrsta: "tekst", najvise: 60 },
      { ime: "kpdProdaja", oznaka: "KPD za prodaju", vrsta: "kpd", opis: "Npr. 26.20.11 (prijenosna računala). Obavezan na eRačunu." },
      { ime: "kpdNajam", oznaka: "KPD za najam", vrsta: "kpd", opis: "Najam je usluga, npr. 77.33.11." },
      { ime: "jamstvoMjeseci", oznaka: "Jamstvo (mjeseci)", vrsta: "cijeli", min: 0, max: 120, obavezno: true },
      { ime: "preporucenaCijena", oznaka: "Preporučena cijena (€, bez PDV-a)", vrsta: "iznos", max: 99_999_999_99 },
      { ime: "marza", oznaka: "Ciljana marža (%)", vrsta: "postotak", max: 100_000, osjetljivo: true },
      { ime: "opis", oznaka: "Opis", vrsta: "dugiTekst" },
    ],
    jedinstvenoUnutar: ["proizvodjacId"],
    stupci: ["proizvodjacId", "naziv", "kategorijaId", "kpdProdaja", "jamstvoMjeseci", "preporucenaCijena", "marza"],
    reference: [{ model: "uredaj", polje: "modelId", naziv: "uređaja" }],
  },
  {
    kljuc: "skladista",
    model: "skladiste",
    entitet: "Skladiste",
    naslov: "Skladišta",
    jednina: "Skladište",
    opis: "Lokacije na kojima su uređaji.",
    polja: [
      NAZIV,
      { ime: "adresa", oznaka: "Adresa", vrsta: "tekst", najvise: 200 },
      { ime: "zadano", oznaka: "Zadano za zaprimanje", vrsta: "kvacica" },
    ],
    stupci: ["naziv", "adresa", "zadano"],
    reference: [
      { model: "uredaj", polje: "skladisteId", naziv: "uređaja" },
      { model: "primka", polje: "skladisteId", naziv: "primki" },
    ],
    jedinstvenaKvacica: "zadano",
  },
  {
    kljuc: "stanja-robe",
    model: "stanjeRobe",
    entitet: "StanjeRobe",
    naslov: "Stanja robe",
    jednina: "Stanje robe",
    opis: "Novo, rabljeno, obnovljeno, neispravno…",
    polja: [NAZIV],
    stupci: ["naziv"],
    reference: [{ model: "uredaj", polje: "stanjeRobeId", naziv: "uređaja" }],
  },
  {
    kljuc: "usluge",
    model: "usluga",
    entitet: "Usluga",
    naslov: "Usluge",
    jednina: "Usluga",
    opis: "Instalacija, sat servisa, dostava… za stavke ponuda i računa.",
    polja: [
      NAZIV,
      { ime: "sifra", oznaka: "Šifra", vrsta: "tekst", najvise: 60 },
      { ime: "jedinica", oznaka: "Jedinica mjere", vrsta: "tekst", najvise: 20, obavezno: true },
      { ime: "cijena", oznaka: "Cijena (€, bez PDV-a)", vrsta: "iznos", max: 99_999_999_99 },
      { ime: "kpd", oznaka: "KPD", vrsta: "kpd" },
    ],
    stupci: ["naziv", "sifra", "jedinica", "cijena", "kpd"],
    reference: [],
  },
];

export function definicija(kljuc: string): DefinicijaSifrarnika | undefined {
  return SIFRARNICI.find((d) => d.kljuc === kljuc);
}

/** Polja koja se u bazi čuvaju kao Decimal (iznos u centima / postotak u stotinkama ↔ "1500.50"). */
export function jeDecimalno(p: Polje): boolean {
  return p.vrsta === "iznos" || p.vrsta === "postotak";
}
