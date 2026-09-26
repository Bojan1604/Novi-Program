"use client";

import { useRef, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { klaseUnosa } from "@/components/ui/polje";

type Poruka = { gdje: string; poruka: string };
type Izvjestaj = {
  ok: true;
  uvezeno: boolean;
  greske: Poruka[];
  brojGresaka: number;
  upozorenja: Poruka[];
  brojUpozorenja: number;
  brojevi: Record<string, number>;
  poGodinama: { godina: number; racuna: number; stari: number; novi: number; placeno: number }[];
  razlike: { broj: string; datum: string; stari: number; novi: number }[];
  brojRazlika: number;
  numeracija: { niz: string; godina: number; sljedeci: number }[];
  ugovoriGreske: Poruka[];
};

const eur = (c: number) => `${(c / 100).toLocaleString("hr-HR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const NAZIVI: Record<string, string> = {
  kategorije: "Kategorije (nove)",
  proizvodjaci: "Proizvođači (novi)",
  skladista: "Skladišta (nova)",
  modeli: "Modeli",
  usluge: "Usluge",
  partneri: "Partneri (novi)",
  uredaji: "Uređaji",
  racuni: "Računi",
  uplate: "Uplate",
  ugovoriNajma: "Ugovori najma",
};

function Popis({ naslov, poruke, ukupno, vrsta }: { naslov: string; poruke: Poruka[]; ukupno: number; vrsta: "greska" | "upozorenje" }) {
  if (!ukupno) return null;
  return (
    <details open={vrsta === "greska"} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <summary className={`cursor-pointer font-medium ${vrsta === "greska" ? "text-red-700 dark:text-red-400" : ""}`}>
        {naslov}: {ukupno}
      </summary>
      <ul className="mt-2 space-y-1 break-words">
        {poruke.map((p, i) => (
          <li key={i}>
            <span className="text-neutral-500">{p.gdje}:</span> {p.poruka}
          </li>
        ))}
        {ukupno > poruke.length && <li className="text-neutral-500">… i još {ukupno - poruke.length}</li>}
      </ul>
    </details>
  );
}

export function Uvoz() {
  const datoteka = useRef<HTMLInputElement>(null);
  const [izvjestaj, setIzvjestaj] = useState<Izvjestaj | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [uTijeku, setUTijeku] = useState(false);

  const posalji = async (korak: "provjera" | "uvoz") => {
    const f = datoteka.current?.files?.[0];
    if (!f) return setGreska("Odaberite JSON datoteku starog programa.");
    if (korak === "uvoz" && !confirm("Uvesti podatke u ovu firmu? Uvezeni računi su izdani i zaključani.")) return;
    const fd = new FormData();
    fd.set("datoteka", f);
    fd.set("korak", korak);
    setUTijeku(true);
    setGreska(null);
    try {
      const r = (await (await fetch("/api/uvoz", { method: "POST", body: fd })).json()) as Izvjestaj | { ok: false; greska: string };
      if (r.ok) setIzvjestaj(r);
      else setGreska(r.greska);
    } catch {
      setGreska("Slanje nije uspjelo.");
    } finally {
      setUTijeku(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
          JSON datoteka starog programa
          <input
            ref={datoteka}
            type="file"
            name="datoteka"
            accept=".json,application/json"
            className={klaseUnosa}
            onChange={() => {
              setIzvjestaj(null);
              setGreska(null);
            }}
          />
        </label>
        <div className="flex gap-2">
          <Gumb disabled={uTijeku} onClick={() => void posalji("provjera")}>
            {uTijeku ? "Radim…" : "Provjeri"}
          </Gumb>
          <Gumb
            varijanta="primarni"
            disabled={uTijeku || !izvjestaj || izvjestaj.uvezeno || izvjestaj.brojGresaka > 0}
            onClick={() => void posalji("uvoz")}
          >
            Uvezi
          </Gumb>
        </div>
      </div>
      {greska && <Obavijest vrsta="greska">{greska}</Obavijest>}
      {izvjestaj && (
        <div className="flex flex-col gap-3" data-testid="izvjestaj-uvoza">
          {izvjestaj.uvezeno ? (
            <Obavijest vrsta="uspjeh">Uvoz je završen. Zapis je u dnevniku; provjeru stanja pokrenite na stranici „Provjera dosljednosti“.</Obavijest>
          ) : izvjestaj.brojGresaka ? (
            <Obavijest vrsta="greska">
              Datoteka ima {izvjestaj.brojGresaka} grešaka — ispravite ih u izvozu starog programa pa provjerite ponovno.
            </Obavijest>
          ) : (
            <Obavijest vrsta="uspjeh">Provjera je prošla. Pregledajte razlike i upozorenja, pa pokrenite uvoz.</Obavijest>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <table className="tbl text-sm">
              <tbody>
                {Object.entries(izvjestaj.brojevi).map(([k, v]) => (
                  <tr key={k}>
                    <td className="px-2 py-1">{NAZIVI[k] ?? k}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{v.toLocaleString("hr-HR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-col gap-2 text-sm">
              <table className="tbl" data-testid="po-godinama">
                <thead>
                  <tr className="text-left">
                    <th className="px-2 py-1">Godina</th>
                    <th className="px-2 py-1 text-right">Računa</th>
                    <th className="px-2 py-1 text-right">Stari program</th>
                    <th className="px-2 py-1 text-right">Program</th>
                  </tr>
                </thead>
                <tbody>
                  {izvjestaj.poGodinama.map((g) => (
                    <tr key={g.godina}>
                      <td className="px-2 py-1">{g.godina}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{g.racuna}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{eur(g.stari)}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${g.stari !== g.novi ? "text-red-700 dark:text-red-400" : ""}`}>
                        {eur(g.novi)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {izvjestaj.numeracija.length > 0 && (
                <p>Nastavak numeracije: {izvjestaj.numeracija.map((n) => `${n.sljedeci}/${n.niz} (${n.godina}.)`).join(", ")}</p>
              )}
            </div>
          </div>
          {izvjestaj.brojRazlika > 0 && (
            <details className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <summary className="cursor-pointer font-medium">Računi s razlikom iznosa: {izvjestaj.brojRazlika}</summary>
              <ul className="mt-2 space-y-1">
                {izvjestaj.razlike.map((r) => (
                  <li key={`${r.broj}-${r.datum}`}>
                    {r.broj} ({r.datum}): stari {eur(r.stari)}, izračun {eur(r.novi)} (razlika {eur(r.novi - r.stari)})
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Popis naslov="Greške" poruke={izvjestaj.greske} ukupno={izvjestaj.brojGresaka} vrsta="greska" />
          <Popis naslov="Ugovori koji nisu uvezeni" poruke={izvjestaj.ugovoriGreske} ukupno={izvjestaj.ugovoriGreske.length} vrsta="greska" />
          <Popis naslov="Upozorenja" poruke={izvjestaj.upozorenja} ukupno={izvjestaj.brojUpozorenja} vrsta="upozorenje" />
        </div>
      )}
    </div>
  );
}
