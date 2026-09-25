/**
 * Stanje odabira s pretragom (npr. odabir partnera) — čista logika.
 *
 * Greška s prethodnog projekta: brzi Enter birao je krivog partnera jer je lista još
 * pokazivala rezultate za PRETHODNI upit. Pravila:
 *  - rezultati koji ne odgovaraju trenutnom upitu (stigli kasno) se odbacuju
 *  - Enter bira samo iz rezultata za trenutni upit; ako još nisu stigli, čeka ih
 *  - Esc zatvara popis; tek kad je popis zatvoren, Esc smije zatvoriti dijalog
 */

export type Stavka = { id: string; naziv: string; opis?: string };

export type Stanje = {
  upit: string;
  rezultati: Stavka[];
  /** upit za koji su `rezultati` */
  rezultatiZa: string | null;
  istaknut: number;
  otvoren: boolean;
  cekaEnter: boolean;
  /** odabrana stavka (null dok korisnik tipka) */
  odabrano: Stavka | null;
};

export type Radnja =
  | { tip: "tipkanje"; upit: string }
  | { tip: "rezultati"; za: string; stavke: Stavka[] }
  | { tip: "enter" }
  | { tip: "dolje" }
  | { tip: "gore" }
  | { tip: "esc" }
  | { tip: "klik"; stavka: Stavka }
  | { tip: "otvori" }
  | { tip: "zatvori" }
  | { tip: "ocisti" };

export const pocetno = (odabrano: Stavka | null = null): Stanje => ({
  upit: odabrano?.naziv ?? "",
  rezultati: [],
  rezultatiZa: null,
  istaknut: 0,
  otvoren: false,
  cekaEnter: false,
  odabrano,
});

function odaberi(s: Stanje, st: Stavka): Stanje {
  return { ...s, otvoren: false, cekaEnter: false, odabrano: st, upit: st.naziv };
}

export function svjezi(s: Stanje): boolean {
  return s.rezultatiZa === s.upit;
}

export function pretrazivac(s: Stanje, r: Radnja): Stanje {
  switch (r.tip) {
    case "tipkanje":
      return { ...s, upit: r.upit, otvoren: true, istaknut: 0, cekaEnter: false, odabrano: null };
    case "rezultati": {
      if (r.za !== s.upit) return s; // stigao kasno — za stari upit
      const n = { ...s, rezultati: r.stavke, rezultatiZa: r.za, istaknut: 0 };
      if (s.cekaEnter) {
        return r.stavke[0] ? odaberi(n, r.stavke[0]) : { ...n, cekaEnter: false };
      }
      return n;
    }
    case "enter": {
      // čekati svježe rezultate ima smisla samo dok korisnik tipka (popis otvoren, ništa odabrano)
      if (!svjezi(s)) return s.upit.trim() && s.otvoren && !s.odabrano ? { ...s, cekaEnter: true } : s;
      const st = s.rezultati[s.istaknut];
      return st ? odaberi(s, st) : s;
    }
    case "dolje":
      if (!s.otvoren) return { ...s, otvoren: true, cekaEnter: false };
      return svjezi(s) ? { ...s, istaknut: Math.min(s.istaknut + 1, Math.max(0, s.rezultati.length - 1)) } : s;
    case "gore":
      return svjezi(s) ? { ...s, istaknut: Math.max(s.istaknut - 1, 0) } : s;
    case "esc":
      return { ...s, otvoren: false, cekaEnter: false };
    case "klik":
      return odaberi(s, r.stavka);
    case "otvori":
      return s.odabrano ? s : { ...s, otvoren: true, cekaEnter: false };
    case "zatvori":
      return { ...s, otvoren: false, cekaEnter: false };
    case "ocisti":
      return pocetno();
  }
}
