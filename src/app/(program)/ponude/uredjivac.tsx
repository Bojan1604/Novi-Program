"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { klaseUnosa, Odabir, Polje } from "@/components/ui/polje";
import { Pretrazivac } from "@/components/ui/pretrazivac";
import type { Stavka } from "@/components/ui/pretrazivac-stanje";
import { GumbiSkenera } from "@/components/ui/skener";
import { dodajDane, jeDatum, procitajDatum } from "@/domain/datum";
import { formatirajIznos, procitajIznos } from "@/domain/novac";
import type { PdvStatus } from "@/domain/partner";
import { STOPE_PDV } from "@/domain/pdv";
import {
  formatirajKolicinu,
  izracunajDokument,
  procitajKolicinu,
  VRSTE_PRODAJE,
  VRSTE_STAVKI,
  type UlaznaStavka,
  type VrstaProdaje,
  type VrstaStavke,
} from "@/domain/prodaja";
import { serijskiIzKoda } from "@/domain/skeniranje";
import { artiklAkcija, podaciKupcaAkcija, spremiDokumentAkcija } from "./akcije";

type Red = {
  kljuc: number;
  vrsta: VrstaStavke;
  namjena: "PRODAJA" | "NAJAM";
  uredajId: string | null;
  modelId: string | null;
  uslugaId: string | null;
  naziv: string;
  opis: string;
  kpdProdaja: string | null;
  kpdNajam: string | null;
  jedinica: string;
  kolicina: string;
  cijena: string;
  popust: string;
  stopa: number;
  vrstaIsporuke: "ROBA" | "USLUGA";
  upozorenje?: string;
};

export type PocetniDokument = {
  id: string | null;
  vrsta: VrstaProdaje;
  verzija: number;
  partner: Stavka | null;
  statusKupca: PdvStatus;
  poslovnice: { id: string; naziv: string }[];
  poslovnicaId: string | null;
  datum: string;
  vrijediDo: string | null;
  dospijece: string | null;
  popust: number;
  napomena: string;
  stavke: (Omit<UlaznaStavka, "opis" | "kpd"> & { opis: string | null; kpd: string | null })[];
};

const uUpis = (d: string | null) => (d ? d.split("-").reverse().join(".") + "." : "");
const iznosUpis = (c: number) => formatirajIznos(c);
let brojac = 0;

function uRed(s: PocetniDokument["stavke"][number]): Red {
  return {
    kljuc: ++brojac,
    vrsta: s.vrsta,
    namjena: s.namjena,
    uredajId: s.uredajId ?? null,
    modelId: s.modelId ?? null,
    uslugaId: s.uslugaId ?? null,
    naziv: s.naziv,
    opis: s.opis ?? "",
    kpdProdaja: s.namjena === "PRODAJA" ? s.kpd : null,
    kpdNajam: s.namjena === "NAJAM" ? s.kpd : null,
    jedinica: s.jedinica,
    kolicina: formatirajKolicinu(s.kolicina),
    cijena: iznosUpis(s.cijena),
    popust: s.popust ? iznosUpis(s.popust) : "",
    stopa: s.stopa,
    vrstaIsporuke: s.vrstaIsporuke ?? "ROBA",
  };
}

/** Pretvorba reda u ulaznu stavku; neispravan upis → null i poruka. */
function procitajRed(r: Red, i: number): { stavka: UlaznaStavka | null; greska: string | null } {
  const k = procitajKolicinu(r.kolicina);
  const c = procitajIznos(r.cijena);
  const p = r.popust.trim() ? procitajIznos(r.popust.replace(/\s*%$/, "")) : ({ ok: true, vrijednost: 0 } as const);
  const g = !k.ok ? k.greska : !c.ok ? c.greska : !p.ok ? "Popust nije ispravan." : null;
  if (g || !k.ok || !c.ok || !p.ok) return { stavka: null, greska: `Stavka ${i + 1}: ${g}` };
  return {
    stavka: {
      vrsta: r.vrsta,
      namjena: r.namjena,
      uredajId: r.uredajId,
      modelId: r.modelId,
      uslugaId: r.uslugaId,
      naziv: r.naziv,
      opis: r.opis || null,
      kpd: (r.namjena === "NAJAM" ? r.kpdNajam : r.kpdProdaja) ?? null,
      jedinica: r.jedinica,
      kolicina: k.vrijednost,
      cijena: c.vrijednost,
      popust: p.vrijednost,
      stopa: r.stopa,
      vrstaIsporuke: r.vrstaIsporuke,
    },
    greska: null,
  };
}

export function UredjivacDokumenta({
  pocetno,
  firma,
  danas,
}: {
  pocetno: PocetniDokument;
  firma: { uSustavuPdv: boolean; pdvPoNaplacenoj: boolean; rokPlacanjaDana: number };
  danas: string;
}) {
  const [partner, setPartner] = useState<Stavka | null>(pocetno.partner);
  const [statusKupca, setStatusKupca] = useState<PdvStatus>(pocetno.statusKupca);
  const [poslovnice, setPoslovnice] = useState(pocetno.poslovnice);
  const [poslovnicaId, setPoslovnicaId] = useState(pocetno.poslovnicaId ?? "");
  const [datum, setDatum] = useState(uUpis(pocetno.datum));
  const [vrijediDo, setVrijediDo] = useState(uUpis(pocetno.vrijediDo));
  const [dospijece, setDospijece] = useState(uUpis(pocetno.dospijece));
  const [popust, setPopust] = useState(pocetno.popust ? iznosUpis(pocetno.popust) : "");
  const [napomena, setNapomena] = useState(pocetno.napomena);
  const [redovi, setRedovi] = useState<Red[]>(() => pocetno.stavke.map(uRed));
  const [verzija, setVerzija] = useState(pocetno.verzija);
  const [greska, setGreska] = useState<string | null>(null);
  const [novaVrsta, setNovaVrsta] = useState<"MODEL" | "USLUGA">("MODEL");
  const [kljucOdabira, setKljucOdabira] = useState(0);
  const serijski = useRef<HTMLInputElement>(null);
  const jePonuda = pocetno.vrsta === "PONUDA";

  const [stanje, posalji, uTijeku] = useActionState(async (p: Awaited<ReturnType<typeof spremiDokumentAkcija>> | undefined, fd: FormData) => {
    const r = await spremiDokumentAkcija(p, fd);
    if (r.ok && r.podaci) setVerzija(r.podaci.verzija);
    return r;
  }, undefined);

  const procitani = redovi.map(procitajRed);
  const popustDok = popust.trim() ? procitajIznos(popust.replace(/\s*%$/, "")) : ({ ok: true, vrijednost: 0 } as const);
  const izracun = (() => {
    const stavke = procitani.map((x) => x.stavka).filter((x): x is UlaznaStavka => !!x);
    if (stavke.length !== procitani.length || !popustDok.ok || popustDok.vrijednost > 10000) return null;
    try {
      return izracunajDokument(stavke, {
        firmaUSustavuPdv: firma.uSustavuPdv,
        pdvPoNaplacenoj: firma.pdvPoNaplacenoj,
        statusKupca,
        popust: popustDok.vrijednost,
      });
    } catch {
      return null;
    }
  })();

  const promijeni = (kljuc: number, x: Partial<Red>) => setRedovi((l) => l.map((r) => (r.kljuc === kljuc ? { ...r, ...x } : r)));

  const dodajArtikl = async (vrsta: "UREDAJ" | "MODEL" | "USLUGA", oznaka: string) => {
    setGreska(null);
    const r = await artiklAkcija(vrsta, oznaka, partner?.id ?? null);
    if (!r.ok) {
      setGreska(r.greska);
      return;
    }
    const a = r.podaci;
    if (a.uredajId && redovi.some((x) => x.uredajId === a.uredajId)) {
      setGreska(`Uređaj ${a.serijski} je već na dokumentu.`);
      return;
    }
    setRedovi((l) => [
      ...l,
      {
        kljuc: ++brojac,
        vrsta,
        namjena: "PRODAJA",
        uredajId: a.uredajId,
        modelId: a.modelId,
        uslugaId: "uslugaId" in a ? (a.uslugaId ?? null) : null,
        naziv: a.naziv,
        opis: a.opis ?? "",
        kpdProdaja: a.kpdProdaja,
        kpdNajam: a.kpdNajam,
        jedinica: a.jedinica,
        kolicina: "1",
        cijena: a.cijena === null ? "" : iznosUpis(a.cijena),
        popust: "",
        stopa: 2500,
        vrstaIsporuke: vrsta === "USLUGA" ? "USLUGA" : "ROBA",
        upozorenje: a.stanje && !["NA_SKLADISTU", "REZERVIRAN"].includes(a.stanje) ? "Uređaj nije na skladištu." : undefined,
      },
    ]);
  };

  const odaberiKupca = async (s: Stavka | null) => {
    setPartner(s);
    setPoslovnicaId("");
    const r = await podaciKupcaAkcija(
      s?.id ?? null,
      redovi.map((x) => ({ modelId: x.modelId, uslugaId: x.uslugaId })),
    );
    if (!r.ok) return;
    setStatusKupca(r.podaci.statusKupca);
    setPoslovnice(r.podaci.poslovnice);
    // cijene po cjeniku novog kupca (ručne stavke ostaju)
    setRedovi((l) =>
      l.map((x, i) => (r.podaci.cijene[i] !== null && r.podaci.cijene[i] !== undefined ? { ...x, cijena: iznosUpis(r.podaci.cijene[i]!) } : x)),
    );
    const d = procitajDatum(datum);
    if (!jePonuda && d.ok && r.podaci.rokPlacanja !== null && jeDatum(d.vrijednost))
      setDospijece(uUpis(dodajDane(d.vrijednost, r.podaci.rokPlacanja)));
  };

  const spremi = () => {
    const greske = procitani.map((x) => x.greska).filter(Boolean);
    if (greske.length) return setGreska(greske.slice(0, 3).join(" "));
    if (!popustDok.ok) return setGreska("Popust dokumenta nije ispravan.");
    const datumi: Record<string, string | null> = {};
    for (const [ime, v] of [
      ["datum", datum],
      ["vrijediDo", vrijediDo],
      ["dospijece", dospijece],
    ] as const) {
      if (!v.trim()) {
        datumi[ime] = null;
        continue;
      }
      const r = procitajDatum(v);
      if (!r.ok) return setGreska(`Datum nije ispravan: ${v}`);
      datumi[ime] = r.vrijednost;
    }
    if (!datumi["datum"]) return setGreska("Upišite datum.");
    setGreska(null);
    const fd = new FormData();
    fd.set(
      "podaci",
      JSON.stringify({
        id: pocetno.id,
        vrsta: pocetno.vrsta,
        verzija,
        partnerId: partner?.id ?? null,
        poslovnicaId: poslovnicaId || null,
        datum: datumi["datum"],
        vrijediDo: jePonuda ? datumi["vrijediDo"] : null,
        dospijece: jePonuda ? null : datumi["dospijece"],
        popust: popustDok.vrijednost,
        napomena,
        stavke: procitani.map((x) => x.stavka),
      }),
    );
    startTransition(() => posalji(fd));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Pretrazivac izvor="/api/odabir/partneri?vrsta=kupac" oznaka="Kupac" pocetna={pocetno.partner} onPromjena={(s) => void odaberiKupca(s)} />
        </div>
        {poslovnice.length > 0 && (
          <Odabir oznaka="Poslovnica" value={poslovnicaId} onChange={(e) => setPoslovnicaId(e.target.value)}>
            <option value="">—</option>
            {poslovnice.map((p) => (
              <option key={p.id} value={p.id}>
                {p.naziv}
              </option>
            ))}
          </Odabir>
        )}
        <Polje oznaka="Datum" value={datum} onChange={(e) => setDatum(e.target.value)} />
        {jePonuda ? (
          <Polje oznaka="Vrijedi do" value={vrijediDo} onChange={(e) => setVrijediDo(e.target.value)} placeholder="npr. 10.10.2026." />
        ) : (
          <Polje oznaka="Dospijeće" value={dospijece} onChange={(e) => setDospijece(e.target.value)} />
        )}
        <Polje oznaka="Popust na dokument (%)" value={popust} onChange={(e) => setPopust(e.target.value)} inputMode="decimal" />
      </div>
      {statusKupca !== "DOMACI" && (
        <Obavijest vrsta="info">
          Kupac: {statusKupca === "EU_OBVEZNIK" ? "obveznik PDV-a iz EU" : statusKupca === "EU_NEOBVEZNIK" ? "iz EU bez PDV broja" : "izvan EU"} — PDV
          se obračunava prema tome (vidi napomene ispod).
        </Obavijest>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="text-sm font-medium">Dodaj stavku</div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Uređaj po serijskom broju (skener ili upis, Enter)</span>
              <input
                ref={serijski}
                className={`${klaseUnosa} font-mono`}
                aria-label="Serijski broj uređaja"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const s = serijskiIzKoda(e.currentTarget.value);
                  if (s) void dodajArtikl("UREDAJ", s);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <GumbiSkenera skupno onSerijski={(s) => void dodajArtikl("UREDAJ", s)} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <Odabir oznaka="Vrsta" value={novaVrsta} onChange={(e) => setNovaVrsta(e.target.value as "MODEL" | "USLUGA")}>
                <option value="MODEL">Model</option>
                <option value="USLUGA">Usluga</option>
              </Odabir>
              <Pretrazivac
                key={`${novaVrsta}-${kljucOdabira}`}
                izvor={`/api/odabir/${novaVrsta === "MODEL" ? "modeli" : "usluge"}`}
                oznaka={novaVrsta === "MODEL" ? "Model (bez serijskog)" : "Usluga"}
                onPromjena={(s) => {
                  if (!s) return;
                  void dodajArtikl(novaVrsta, s.id);
                  setKljucOdabira((x) => x + 1);
                }}
              />
            </div>
            <div>
              <Gumb
                malen
                onClick={() =>
                  setRedovi((l) => [
                    ...l,
                    {
                      kljuc: ++brojac,
                      vrsta: "RUCNA",
                      namjena: "PRODAJA",
                      uredajId: null,
                      modelId: null,
                      uslugaId: null,
                      naziv: "",
                      opis: "",
                      kpdProdaja: null,
                      kpdNajam: null,
                      jedinica: "kom",
                      kolicina: "1",
                      cijena: "",
                      popust: "",
                      stopa: 2500,
                      vrstaIsporuke: "ROBA",
                    },
                  ])
                }
              >
                Ručna stavka
              </Gumb>
            </div>
          </div>
        </div>
      </div>

      {redovi.length > 0 && (
        <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="stavke-dokumenta">
          {redovi.map((r, i) => {
            const izr = izracun?.stavke[i];
            return (
              <div key={r.kljuc} className="grid gap-2 py-3 sm:grid-cols-12 sm:items-end" data-stavka={i + 1}>
                <div className="flex min-w-0 flex-col gap-1 sm:col-span-4">
                  <span className="text-xs text-neutral-500">
                    {i + 1}. {VRSTE_STAVKI[r.vrsta]}
                    {izr && izr.kategorija.kod !== "HR" && ` · ${izr.kategorija.naziv}`}
                  </span>
                  <input
                    className={klaseUnosa}
                    value={r.naziv}
                    onChange={(e) => promijeni(r.kljuc, { naziv: e.target.value })}
                    aria-label={`Naziv stavke ${i + 1}`}
                  />
                  {(r.opis || r.vrsta === "RUCNA") && (
                    <input
                      className={`${klaseUnosa} text-xs`}
                      value={r.opis}
                      onChange={(e) => promijeni(r.kljuc, { opis: e.target.value })}
                      placeholder="Opis"
                      aria-label={`Opis stavke ${i + 1}`}
                    />
                  )}
                  {r.upozorenje && <span className="text-xs text-amber-700 dark:text-amber-400">{r.upozorenje}</span>}
                </div>
                {r.vrsta === "UREDAJ" || r.vrsta === "MODEL" ? (
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-xs text-neutral-500">Namjena</span>
                    <select
                      className={klaseUnosa}
                      value={r.namjena}
                      onChange={(e) => promijeni(r.kljuc, { namjena: e.target.value as Red["namjena"] })}
                    >
                      <option value="PRODAJA">Prodaja</option>
                      <option value="NAJAM">Najam</option>
                    </select>
                  </label>
                ) : r.vrsta === "RUCNA" ? (
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-xs text-neutral-500">Vrsta</span>
                    <select
                      className={klaseUnosa}
                      value={r.vrstaIsporuke}
                      onChange={(e) => promijeni(r.kljuc, { vrstaIsporuke: e.target.value as Red["vrstaIsporuke"] })}
                    >
                      <option value="ROBA">Roba</option>
                      <option value="USLUGA">Usluga</option>
                    </select>
                  </label>
                ) : (
                  <div className="hidden sm:col-span-2 sm:block" />
                )}
                <label className="flex flex-col gap-1 sm:col-span-1">
                  <span className="text-xs text-neutral-500">Kol. ({r.jedinica})</span>
                  <input
                    className={klaseUnosa}
                    value={r.kolicina}
                    disabled={r.vrsta === "UREDAJ"}
                    inputMode="decimal"
                    onChange={(e) => promijeni(r.kljuc, { kolicina: e.target.value })}
                    aria-label={`Količina stavke ${i + 1}`}
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs text-neutral-500">Cijena bez PDV-a</span>
                  <input
                    className={klaseUnosa}
                    value={r.cijena}
                    inputMode="decimal"
                    onChange={(e) => promijeni(r.kljuc, { cijena: e.target.value })}
                    aria-label={`Cijena stavke ${i + 1}`}
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-1">
                  <span className="text-xs text-neutral-500">Popust %</span>
                  <input
                    className={klaseUnosa}
                    value={r.popust}
                    inputMode="decimal"
                    onChange={(e) => promijeni(r.kljuc, { popust: e.target.value })}
                    aria-label={`Popust stavke ${i + 1}`}
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-1">
                  <span className="text-xs text-neutral-500">PDV</span>
                  <select
                    className={klaseUnosa}
                    value={r.stopa}
                    onChange={(e) => promijeni(r.kljuc, { stopa: Number(e.target.value) })}
                    aria-label={`Stopa PDV-a stavke ${i + 1}`}
                  >
                    {STOPE_PDV.map((s) => (
                      <option key={s} value={s}>
                        {s / 100} %
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                  <span className="text-sm font-medium tabular-nums" aria-label={`Iznos stavke ${i + 1}`}>
                    {izr ? formatirajIznos(izr.iznos) : "—"}
                  </span>
                  <Gumb
                    malen
                    varijanta="tihi"
                    aria-label={`Ukloni stavku ${i + 1}`}
                    onClick={() => setRedovi((l) => l.filter((x) => x.kljuc !== r.kljuc))}
                  >
                    Ukloni
                  </Gumb>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Napomena</span>
          <textarea className={klaseUnosa} rows={3} value={napomena} onChange={(e) => setNapomena(e.target.value)} maxLength={5000} />
        </label>
        <dl className="grid min-w-64 grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums" data-testid="zbrojevi">
          {izracun ? (
            <>
              {izracun.zbrojevi.popust > 0 && (
                <>
                  <dt>Popust</dt>
                  <dd className="text-right">−{formatirajIznos(izracun.zbrojevi.popust)} €</dd>
                </>
              )}
              <dt>Osnovica</dt>
              <dd className="text-right">{formatirajIznos(izracun.zbrojevi.osnovica)} €</dd>
              {izracun.zbrojevi.poKategoriji
                .filter((k) => k.stopa > 0)
                .map((k) => (
                  <div key={`${k.kod}${k.stopa}`} className="contents">
                    <dt>PDV {k.stopa / 100} %</dt>
                    <dd className="text-right">{formatirajIznos(k.pdv)} €</dd>
                  </div>
                ))}
              <dt className="font-semibold">Ukupno</dt>
              <dd className="text-right font-semibold">{formatirajIznos(izracun.zbrojevi.ukupno)} €</dd>
            </>
          ) : (
            <dd className="col-span-2 text-neutral-500">Ispravite upis za izračun.</dd>
          )}
        </dl>
      </div>
      {izracun && izracun.napomene.length > 0 && (
        <ul className="text-xs text-neutral-600 dark:text-neutral-400">
          {izracun.napomene.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {greska && <Obavijest vrsta="greska">{greska}</Obavijest>}
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      <div className="flex flex-wrap gap-2">
        <Gumb varijanta="primarni" onClick={spremi} disabled={uTijeku}>
          Spremi nacrt
        </Gumb>
        <span className="self-center text-xs text-neutral-500">
          {VRSTE_PRODAJE[pocetno.vrsta].naziv} dobiva broj tek pri izdavanju. Danas: {uUpis(danas)}
        </span>
      </div>
    </div>
  );
}
