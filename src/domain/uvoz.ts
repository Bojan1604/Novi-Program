/**
 * Uvoz iz starog programa (korak 7.1) — čista provjera JSON-a prije uvoza.
 *
 * Format je opisan u docs/UVOZ.md (primjer: docs/primjer-uvoza.json). Provjera vraća sve greške
 * (uvoz se ne smije pokrenuti) i upozorenja (uvoz može, ali pogledajte), a za račune usporedbu
 * iznosa starog programa s iznosom koji program izračuna iz stavki (izvještaj razlika).
 */
import { jeOib } from "./oib";
import { normalizirajSerijski } from "./stanja-uredaja";

export const FORMAT_UVOZA = "erp-wms-uvoz";

export const STANJA_UVOZA = ["NA_SKLADISTU", "PRODAN", "U_NAJMU", "OTPISAN"] as const;
export type StanjeUvoza = (typeof STANJA_UVOZA)[number];

export type ModelUvoza = {
  sifra: string;
  naziv: string;
  proizvodjac: string;
  kategorija: string;
  preporucenaCijena: number | null;
  jamstvoMjeseci: number;
  kpdProdaja: string | null;
};
export type UslugaUvoza = { sifra: string | null; naziv: string; jedinica: string; cijena: number | null; kpd: string | null };
export type PartnerUvoza = {
  sifra: string;
  naziv: string;
  oib: string | null;
  pdvBroj: string | null;
  drzava: string;
  adresa: string | null;
  postanskiBroj: string | null;
  mjesto: string | null;
  email: string | null;
  telefon: string | null;
  kupac: boolean;
  dobavljac: boolean;
  rokPlacanjaDana: number;
};
export type UredajUvoza = {
  serijski: string;
  model: string;
  stanje: StanjeUvoza;
  skladiste: string | null;
  partner: string | null;
  nabavnaCijena: number | null;
  nabavniDatum: string | null;
  jamstvoDo: string | null;
  cpu: string | null;
  ram: string | null;
  disk: string | null;
  os: string | null;
  napomena: string | null;
};
export type StavkaUvoza = {
  naziv: string;
  serijski: string | null;
  jedinica: string;
  /** tisućinke */
  kolicina: number;
  /** centi bez PDV-a */
  cijena: number;
  /** stotinke postotka */
  popust: number;
  /** stotinke postotka */
  stopa: number;
  vrstaIsporuke: "ROBA" | "USLUGA";
  kpd: string | null;
};
export type RacunUvoza = {
  broj: string;
  redni: number;
  prostor: string;
  naplatniUredaj: string;
  datum: string;
  dospijece: string | null;
  partner: string | null;
  nacinPlacanja: string;
  napomena: string | null;
  /** stotinke postotka, popust na cijeli račun */
  popust: number;
  stavke: StavkaUvoza[];
  /** iznos sa starog računa (centi) — za izvještaj razlika */
  ukupno: number | null;
  uplate: { datum: string; iznos: number; nacin: string }[];
  zki: string | null;
  jir: string | null;
};
export type UgovorUvoza = {
  broj: string;
  partner: string;
  od: string;
  do: string | null;
  rokPlacanjaDana: number;
  nacinPlacanja: string;
  /** zadnji mjesec koji je stari program već naplatio (YYYY-MM) */
  naplacenoDo: string | null;
  uredaji: { serijski: string; od: string; cijena: number }[];
};

export type PodaciUvoza = {
  kategorije: string[];
  proizvodjaci: string[];
  modeli: ModelUvoza[];
  usluge: UslugaUvoza[];
  skladista: string[];
  partneri: PartnerUvoza[];
  uredaji: UredajUvoza[];
  racuni: RacunUvoza[];
  ugovori: UgovorUvoza[];
};

export type Poruka = { gdje: string; poruka: string };
export type ProvjeraUvoza = { podaci: PodaciUvoza; greske: Poruka[]; upozorenja: Poruka[] };

const RE_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const RE_MJESEC = /^\d{4}-\d{2}$/;
const RE_BROJ_RACUNA = /^(\d{1,9})\/([\p{L}\p{N}]{1,20})\/([\p{L}\p{N}]{1,20})$/u;
const NACINI = ["T", "G", "K", "O"];

/** Iznos iz JSON-a: broj ili tekst s točkom („1234.50“) → centi; sve ostalo je greška (nikad 0). */
export function iznosUvoza(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const c = Math.round(v * 100);
    return Math.abs(c - v * 100) < 1e-6 ? c : null;
  }
  if (typeof v === "string" && /^-?\d{1,12}(\.\d{1,2})?$/.test(v.trim())) {
    const [cijeli, dec = ""] = v.trim().replace("-", "").split(".");
    const c = Number(cijeli) * 100 + Number(dec.padEnd(2, "0"));
    return v.trim().startsWith("-") ? -c : c;
  }
  return null;
}

/** Postotak ili količina s do 3 decimale → tisućinke/stotinke po faktoru. */
function brojSDecimalama(v: unknown, faktor: number): number | null {
  const n = typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n * faktor);
  return Math.abs(r - n * faktor) < 1e-6 ? r : null;
}

function jeStvarniDatum(d: string): boolean {
  if (!RE_DATUM.test(d)) return false;
  const x = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(x.getTime()) && x.toISOString().slice(0, 10) === d;
}

/** Tekstovi su ograničeni (stari program može imati smeće u poljima). */
function tekst(v: unknown, najvise = 500): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).trim();
  return t ? t.slice(0, najvise) : null;
}

function niz(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function objekt(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Provjera cijelog JSON-a (bez baze). Postojanje u bazi provjerava servis. */
export function provjeriUvoz(ulaz: unknown, danas: string): ProvjeraUvoza {
  const greske: Poruka[] = [];
  const upozorenja: Poruka[] = [];
  const g = (gdje: string, poruka: string) => greske.push({ gdje, poruka });
  const u = (gdje: string, poruka: string) => upozorenja.push({ gdje, poruka });
  const o = objekt(ulaz);
  const podaci: PodaciUvoza = {
    kategorije: [],
    proizvodjaci: [],
    modeli: [],
    usluge: [],
    skladista: [],
    partneri: [],
    uredaji: [],
    racuni: [],
    ugovori: [],
  };
  if (o["format"] !== FORMAT_UVOZA || o["verzija"] !== 1) {
    g("datoteka", `Datoteka nije u formatu uvoza („format": "${FORMAT_UVOZA}", „verzija": 1) — vidi docs/UVOZ.md.`);
    return { podaci, greske, upozorenja };
  }
  const jedinstveno = (popis: string[], sto: string) => {
    const vidjeno = new Set<string>();
    const out: string[] = [];
    for (const x of popis) {
      const k = x.toLowerCase();
      if (vidjeno.has(k)) u(sto, `„${x}“ se ponavlja — uvozi se jednom.`);
      else {
        vidjeno.add(k);
        out.push(x);
      }
    }
    return out;
  };

  podaci.kategorije = jedinstveno(
    niz(o["kategorije"])
      .map((x) => tekst(x, 100))
      .filter((x): x is string => !!x),
    "kategorije",
  );
  podaci.proizvodjaci = jedinstveno(
    niz(o["proizvodjaci"])
      .map((x) => tekst(x, 100))
      .filter((x): x is string => !!x),
    "proizvodjaci",
  );
  podaci.skladista = jedinstveno(
    niz(o["skladista"])
      .map((x) => tekst(x, 100))
      .filter((x): x is string => !!x),
    "skladista",
  );

  // modeli
  const modeli = new Map<string, ModelUvoza>();
  niz(o["modeli"]).forEach((x, i) => {
    const m = objekt(x);
    const gdje = `modeli[${i}]`;
    const naziv = tekst(m["naziv"], 200);
    const proizvodjac = tekst(m["proizvodjac"], 100);
    const kategorija = tekst(m["kategorija"], 100);
    if (!naziv || !proizvodjac || !kategorija) return g(gdje, "Model mora imati naziv, proizvođača i kategoriju.");
    const sifra = tekst(m["sifra"], 60) ?? naziv;
    if (modeli.has(sifra.toLowerCase())) return g(gdje, `Šifra modela „${sifra}“ se ponavlja.`);
    const cijena = m["preporucenaCijena"] === undefined || m["preporucenaCijena"] === null ? null : iznosUvoza(m["preporucenaCijena"]);
    if (m["preporucenaCijena"] != null && cijena === null) g(gdje, "Preporučena cijena nije ispravan iznos.");
    const jamstvo = m["jamstvoMjeseci"] === undefined ? 24 : Number(m["jamstvoMjeseci"]);
    if (!Number.isInteger(jamstvo) || jamstvo < 0 || jamstvo > 120) g(gdje, "Jamstvo: 0–120 mjeseci.");
    if (!podaci.proizvodjaci.some((p) => p.toLowerCase() === proizvodjac.toLowerCase())) podaci.proizvodjaci.push(proizvodjac);
    if (!podaci.kategorije.some((p) => p.toLowerCase() === kategorija.toLowerCase())) podaci.kategorije.push(kategorija);
    const model = { sifra, naziv, proizvodjac, kategorija, preporucenaCijena: cijena, jamstvoMjeseci: jamstvo, kpdProdaja: tekst(m["kpd"], 20) };
    modeli.set(sifra.toLowerCase(), model);
    podaci.modeli.push(model);
  });

  niz(o["usluge"]).forEach((x, i) => {
    const s = objekt(x);
    const naziv = tekst(s["naziv"], 200);
    if (!naziv) return g(`usluge[${i}]`, "Usluga mora imati naziv.");
    const cijena = s["cijena"] == null ? null : iznosUvoza(s["cijena"]);
    if (s["cijena"] != null && cijena === null) g(`usluge[${i}]`, "Cijena nije ispravan iznos.");
    podaci.usluge.push({ sifra: tekst(s["sifra"], 60), naziv, jedinica: tekst(s["jedinica"], 10) ?? "kom", cijena, kpd: tekst(s["kpd"], 20) });
  });

  // partneri
  const partneri = new Map<string, PartnerUvoza>();
  const oibi = new Map<string, string>();
  niz(o["partneri"]).forEach((x, i) => {
    const p = objekt(x);
    const gdje = `partneri[${i}]`;
    const sifra = tekst(p["sifra"], 60);
    const naziv = tekst(p["naziv"], 200);
    if (!sifra || !naziv) return g(gdje, "Partner mora imati šifru (iz starog programa) i naziv.");
    if (partneri.has(sifra)) return g(gdje, `Šifra partnera „${sifra}“ se ponavlja.`);
    const drzava = (tekst(p["drzava"], 2) ?? "HR").toUpperCase();
    if (!/^[A-Z]{2}$/.test(drzava)) g(gdje, "Država mora biti dvoslovna oznaka (HR, DE…).");
    let oib = tekst(p["oib"], 20);
    if (oib && drzava === "HR" && !jeOib(oib)) {
      u(gdje, `OIB ${oib} (${naziv}) nije ispravan — partner se uvozi bez OIB-a.`);
      oib = null;
    }
    if (oib && drzava !== "HR") oib = null;
    if (oib) {
      if (oibi.has(oib)) u(gdje, `OIB ${oib} ima i partner „${oibi.get(oib)}“ — provjerite duplikate.`);
      else oibi.set(oib, naziv);
    }
    const rok = p["rokPlacanjaDana"] === undefined ? 15 : Number(p["rokPlacanjaDana"]);
    if (!Number.isInteger(rok) || rok < 0 || rok > 365) g(gdje, "Rok plaćanja: 0–365 dana.");
    const partner: PartnerUvoza = {
      sifra,
      naziv,
      oib,
      pdvBroj: tekst(p["pdvBroj"], 20) ?? (oib ? `HR${oib}` : null),
      drzava,
      adresa: tekst(p["adresa"], 200),
      postanskiBroj: tekst(p["postanskiBroj"], 20),
      mjesto: tekst(p["mjesto"], 100),
      email: tekst(p["email"], 200),
      telefon: tekst(p["telefon"], 50),
      kupac: p["kupac"] !== false,
      dobavljac: p["dobavljac"] === true,
      rokPlacanjaDana: rok,
    };
    partneri.set(sifra, partner);
    podaci.partneri.push(partner);
  });
  const skladista = new Set(podaci.skladista.map((s) => s.toLowerCase()));

  // uređaji
  const serijski = new Map<string, UredajUvoza>();
  niz(o["uredaji"]).forEach((x, i) => {
    const d = objekt(x);
    const gdje = `uredaji[${i}]`;
    const sn = normalizirajSerijski(tekst(d["serijski"], 60) ?? "");
    if (!sn) return g(gdje, "Uređaj mora imati serijski broj.");
    if (serijski.has(sn)) return g(gdje, `Serijski ${sn} se ponavlja.`);
    const model = tekst(d["model"], 200);
    if (!model || !modeli.has(model.toLowerCase())) return g(gdje, `Uređaj ${sn}: model „${model ?? ""}“ nije u popisu modela.`);
    let stanje = (tekst(d["stanje"], 20) ?? "NA_SKLADISTU").toUpperCase() as StanjeUvoza;
    if ((stanje as string) === "NA_SERVISU") {
      u(gdje, `Uređaj ${sn} je na servisu u starom programu — uvozi se na skladište; servisni nalog otvorite u programu.`);
      stanje = "NA_SKLADISTU";
    }
    if (!STANJA_UVOZA.includes(stanje)) return g(gdje, `Uređaj ${sn}: stanje mora biti jedno od ${STANJA_UVOZA.join(", ")}.`);
    let skl = tekst(d["skladiste"], 100);
    const partner = tekst(d["partner"], 60);
    if (partner && !partneri.has(partner)) g(gdje, `Uređaj ${sn}: partner „${partner}“ nije u popisu partnera.`);
    if (stanje === "NA_SKLADISTU") {
      if (!skl) {
        u(gdje, `Uređaj ${sn} nema skladište — ide na zadano skladište.`);
      } else if (!skladista.has(skl.toLowerCase())) {
        podaci.skladista.push(skl);
        skladista.add(skl.toLowerCase());
      }
    } else skl = null;
    if ((stanje === "PRODAN" || stanje === "U_NAJMU") && !partner)
      u(gdje, `Uređaj ${sn} je ${stanje === "PRODAN" ? "prodan" : "u najmu"}, ali nema kupca.`);
    const nabavna = d["nabavnaCijena"] == null ? null : iznosUvoza(d["nabavnaCijena"]);
    if (d["nabavnaCijena"] != null && nabavna === null) g(gdje, `Uređaj ${sn}: nabavna cijena nije ispravan iznos.`);
    const datumPolje = (k: string) => {
      const v = tekst(d[k], 10);
      if (v && !jeStvarniDatum(v)) {
        g(gdje, `Uređaj ${sn}: ${k} nije datum (YYYY-MM-DD).`);
        return null;
      }
      return v;
    };
    const ured: UredajUvoza = {
      serijski: sn,
      model: modeli.get(model.toLowerCase())!.sifra,
      stanje,
      skladiste: skl,
      partner: partner && partneri.has(partner) ? partner : null,
      nabavnaCijena: nabavna,
      nabavniDatum: datumPolje("nabavniDatum"),
      jamstvoDo: datumPolje("jamstvoDo"),
      cpu: tekst(d["cpu"], 100),
      ram: tekst(d["ram"], 100),
      disk: tekst(d["disk"], 100),
      os: tekst(d["os"], 100),
      napomena: tekst(d["napomena"], 1000),
    };
    serijski.set(sn, ured);
    podaci.uredaji.push(ured);
  });

  // računi
  const brojevi = new Set<string>();
  niz(o["racuni"]).forEach((x, i) => {
    const r = objekt(x);
    const broj = tekst(r["broj"], 60) ?? "";
    const gdje = `racuni[${i}] ${broj}`;
    const m = RE_BROJ_RACUNA.exec(broj);
    if (!m) return g(gdje, "Broj računa mora biti oblika redni/prostor/uređaj (npr. 15/PP1/1).");
    const datum = tekst(r["datum"], 10) ?? "";
    if (!jeStvarniDatum(datum)) return g(gdje, "Datum računa nije ispravan (YYYY-MM-DD).");
    if (datum > danas) return g(gdje, "Datum računa je u budućnosti.");
    const kljuc = `${datum.slice(0, 4)}:${broj}`;
    if (brojevi.has(kljuc)) return g(gdje, `Račun ${broj} u ${datum.slice(0, 4)}. se ponavlja.`);
    brojevi.add(kljuc);
    const dospijece = tekst(r["dospijece"], 10);
    if (dospijece && (!jeStvarniDatum(dospijece) || dospijece < datum)) g(gdje, "Dospijeće nije ispravno ili je prije datuma računa.");
    const partner = tekst(r["partner"], 60);
    if (partner && !partneri.has(partner)) g(gdje, `Kupac „${partner}“ nije u popisu partnera.`);
    const nacin = (tekst(r["nacinPlacanja"], 1) ?? "T").toUpperCase();
    if (!NACINI.includes(nacin)) g(gdje, "Način plaćanja mora biti T, G, K ili O.");
    const popust = r["popust"] == null ? 0 : brojSDecimalama(r["popust"], 100);
    if (popust === null || popust < 0 || popust > 10000) g(gdje, "Popust na račun: 0–100 %.");
    const stavke: StavkaUvoza[] = [];
    niz(r["stavke"]).forEach((y, j) => {
      const s = objekt(y);
      const gs = `${gdje} stavka ${j + 1}`;
      const naziv = tekst(s["naziv"], 300);
      const kolicina = brojSDecimalama(s["kolicina"] ?? 1, 1000);
      const cijena = iznosUvoza(s["cijena"]);
      const pop = s["popust"] == null ? 0 : brojSDecimalama(s["popust"], 100);
      const stopa = brojSDecimalama(s["stopa"] ?? 25, 100);
      if (!naziv) return g(gs, "Stavka mora imati naziv.");
      if (kolicina === null || kolicina === 0) return g(gs, "Količina nije ispravna.");
      if (cijena === null) return g(gs, "Cijena nije ispravan iznos (bez PDV-a).");
      if (pop === null || pop < 0 || pop > 10000) return g(gs, "Popust: 0–100 %.");
      if (stopa === null || ![0, 500, 1300, 2500].includes(stopa)) return g(gs, "Stopa PDV-a: 0, 5, 13 ili 25.");
      let sn = tekst(s["serijski"], 60);
      if (sn) {
        sn = normalizirajSerijski(sn);
        if (!serijski.has(sn)) u(gs, `Serijski ${sn} nije u popisu uređaja — stavka se uvozi bez veze na uređaj.`);
      }
      const v = (tekst(s["vrstaIsporuke"], 10) ?? (sn ? "ROBA" : "ROBA")).toUpperCase();
      stavke.push({
        naziv,
        serijski: sn && serijski.has(sn) ? sn : null,
        jedinica: tekst(s["jedinica"], 10) ?? "kom",
        kolicina,
        cijena,
        popust: pop,
        stopa,
        vrstaIsporuke: v === "USLUGA" ? "USLUGA" : "ROBA",
        kpd: tekst(s["kpd"], 20),
      });
    });
    if (!stavke.length) g(gdje, "Račun nema ispravnih stavki.");
    const ukupno = r["ukupno"] == null ? null : iznosUvoza(r["ukupno"]);
    if (r["ukupno"] != null && ukupno === null) g(gdje, "Ukupni iznos nije ispravan.");
    if (r["ukupno"] == null) u(gdje, "Nema ukupnog iznosa starog računa — razlika se ne može provjeriti.");
    const uplate: RacunUvoza["uplate"] = [];
    niz(r["uplate"]).forEach((y, j) => {
      const p = objekt(y);
      const d = tekst(p["datum"], 10) ?? "";
      const iznos = iznosUvoza(p["iznos"]);
      const n = (tekst(p["nacin"], 1) ?? "T").toUpperCase();
      if (!jeStvarniDatum(d) || d > danas) return g(`${gdje} uplata ${j + 1}`, "Datum uplate nije ispravan.");
      if (iznos === null || iznos === 0) return g(`${gdje} uplata ${j + 1}`, "Iznos uplate nije ispravan.");
      uplate.push({ datum: d, iznos, nacin: NACINI.includes(n) ? n : "T" });
    });
    const jir = tekst(r["jir"], 40);
    if (!jir) u(gdje, "Račun nema JIR — uvozi se kao nefiskaliziran (ne šalje se naknadno CIS-u).");
    podaci.racuni.push({
      broj,
      redni: Number(m[1]),
      prostor: m[2]!,
      naplatniUredaj: m[3]!,
      datum,
      dospijece: dospijece && jeStvarniDatum(dospijece) && dospijece >= datum ? dospijece : null,
      partner: partner && partneri.has(partner) ? partner : null,
      nacinPlacanja: NACINI.includes(nacin) ? nacin : "T",
      napomena: tekst(r["napomena"], 2000),
      popust: popust ?? 0,
      stavke,
      ukupno,
      uplate,
      zki: tekst(r["zki"], 32),
      jir,
    });
  });

  // ugovori najma
  const naUgovoru = new Set<string>();
  const brojeviUgovora = new Set<string>();
  niz(o["ugovoriNajma"]).forEach((x, i) => {
    const c = objekt(x);
    const broj = tekst(c["broj"], 40) ?? "";
    const gdje = `ugovoriNajma[${i}] ${broj}`;
    if (!broj) return g(gdje, "Ugovor mora imati broj.");
    if (brojeviUgovora.has(broj)) return g(gdje, `Broj ugovora ${broj} se ponavlja.`);
    brojeviUgovora.add(broj);
    const partner = tekst(c["partner"], 60);
    if (!partner || !partneri.has(partner)) return g(gdje, `Najmoprimac „${partner ?? ""}“ nije u popisu partnera.`);
    const od = tekst(c["od"], 10) ?? "";
    const doD = tekst(c["do"], 10);
    if (!jeStvarniDatum(od)) return g(gdje, "Početak ugovora nije datum.");
    if (doD && (!jeStvarniDatum(doD) || doD < od)) return g(gdje, "Kraj ugovora nije ispravan.");
    const naplacenoDo = tekst(c["naplacenoDo"], 7);
    if (naplacenoDo && !RE_MJESEC.test(naplacenoDo)) g(gdje, "„naplacenoDo“ mora biti mjesec YYYY-MM.");
    if (!naplacenoDo) u(gdje, "Nema „naplacenoDo“ — program će nuditi naplatu svih mjeseci od početka ugovora.");
    const nacin = (tekst(c["nacinPlacanja"], 1) ?? "T").toUpperCase();
    const rok = c["rokPlacanjaDana"] === undefined ? 15 : Number(c["rokPlacanjaDana"]);
    if (!Number.isInteger(rok) || rok < 0 || rok > 365) g(gdje, "Rok plaćanja: 0–365 dana.");
    const uredaji: UgovorUvoza["uredaji"] = [];
    niz(c["uredaji"]).forEach((y, j) => {
      const d = objekt(y);
      const sn = normalizirajSerijski(tekst(d["serijski"], 60) ?? "");
      const gu = `${gdje} uređaj ${j + 1}`;
      if (!sn || !serijski.has(sn)) return g(gu, `Serijski ${sn} nije u popisu uređaja.`);
      if (naUgovoru.has(sn)) return g(gu, `Uređaj ${sn} je na više ugovora.`);
      const cijena = iznosUvoza(d["cijena"]);
      if (cijena === null || cijena < 0) return g(gu, "Mjesečna cijena nije ispravna.");
      const odU = tekst(d["od"], 10) ?? od;
      if (!jeStvarniDatum(odU) || odU < od) return g(gu, "Datum od kojeg se uređaj naplaćuje nije ispravan.");
      if (serijski.get(sn)!.stanje !== "U_NAJMU") u(gu, `Uređaj ${sn} nije u stanju U_NAJMU u popisu uređaja — ide u najam s ugovorom.`);
      naUgovoru.add(sn);
      uredaji.push({ serijski: sn, od: odU, cijena });
    });
    if (!uredaji.length) u(gdje, "Ugovor nema uređaja.");
    podaci.ugovori.push({
      broj,
      partner,
      od,
      do: doD && jeStvarniDatum(doD) ? doD : null,
      rokPlacanjaDana: Number.isInteger(rok) ? rok : 15,
      nacinPlacanja: NACINI.includes(nacin) ? nacin : "T",
      naplacenoDo: naplacenoDo && RE_MJESEC.test(naplacenoDo) ? naplacenoDo : null,
      uredaji,
    });
  });
  for (const d of podaci.uredaji)
    if (d.stanje === "U_NAJMU" && !naUgovoru.has(d.serijski)) u(`uredaj ${d.serijski}`, "Uređaj je u najmu, ali nije ni na jednom ugovoru.");

  const poznato = new Set([
    "format",
    "verzija",
    "kategorije",
    "proizvodjaci",
    "modeli",
    "usluge",
    "skladista",
    "partneri",
    "uredaji",
    "racuni",
    "ugovoriNajma",
    "firma",
    "izvor",
    "izvezeno",
  ]);
  for (const k of Object.keys(o)) if (!poznato.has(k)) u("datoteka", `Nepoznati dio „${k}“ se ne uvozi.`);
  return { podaci, greske, upozorenja };
}
