"use client";

import { useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { klaseUnosa, Kvacica, Odabir, Polje } from "@/components/ui/polje";
import { Pretrazivac } from "@/components/ui/pretrazivac";
import type { Stavka } from "@/components/ui/pretrazivac-stanje";
import { formatirajIznos, procitajIznos } from "@/domain/novac";
import type { Odgovor } from "@/lib/greske";
import { spremiNarudzbenicuAkcija, statusNarudzbeniceAkcija, zaprimiAkcija } from "./akcije";

type Red = { kljuc: number; model: Stavka | null; kolicina: string; cijena: string };

export function NovaNarudzbenica({ danas, vidiCijene }: { danas: string; vidiCijene: boolean }) {
  const [dobavljac, setDobavljac] = useState<Stavka | null>(null);
  const [datum, setDatum] = useState(danas);
  const [napomena, setNapomena] = useState("");
  const [redovi, setRedovi] = useState<Red[]>([{ kljuc: 1, model: null, kolicina: "1", cijena: "" }]);
  const [stanje, setStanje] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  const promijeni = (k: number, x: Partial<Red>) => setRedovi((r) => r.map((y) => (y.kljuc === k ? { ...y, ...x } : y)));
  const ukupno = redovi.reduce((a, r) => {
    const c = procitajIznos(r.cijena || "0");
    return a + (c.ok ? c.vrijednost : 0) * (Number(r.kolicina) || 0);
  }, 0);
  const spremi = () =>
    zapocni(async () => {
      const cijene = redovi.map((r) => (vidiCijene ? procitajIznos(r.cijena || "0") : { ok: true as const, vrijednost: 0 }));
      const losa = cijene.findIndex((c) => !c.ok);
      if (losa >= 0) return setStanje({ ok: false, greska: `Stavka ${losa + 1}: cijena nije ispravna.` });
      const r = await spremiNarudzbenicuAkcija(null, {
        datum,
        dobavljacId: dobavljac?.id ?? "",
        napomena: napomena || null,
        verzija: 0,
        stavke: redovi.map((x, i) => ({
          modelId: x.model?.id ?? "",
          kolicina: Number(x.kolicina) || 0,
          cijena: cijene[i]!.ok ? cijene[i]!.vrijednost : 0,
        })),
      });
      setStanje(r);
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Pretrazivac izvor="/api/odabir/partneri?vrsta=dobavljac" oznaka="Dobavljač" onPromjena={setDobavljac} />
        <Polje oznaka="Datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2" data-testid="stavke-narudzbe">
        {redovi.map((r, i) => (
          <div
            key={r.kljuc}
            className="grid gap-2 border-b border-neutral-100 pb-2 sm:grid-cols-[1fr_7rem_9rem_auto] sm:items-end dark:border-neutral-900"
          >
            <Pretrazivac izvor="/api/odabir/modeli" oznaka={`Model ${i + 1}`} onPromjena={(s) => promijeni(r.kljuc, { model: s })} />
            <Polje
              oznaka={`Količina ${i + 1}`}
              inputMode="numeric"
              value={r.kolicina}
              onChange={(e) => promijeni(r.kljuc, { kolicina: e.target.value })}
            />
            {vidiCijene ? (
              <Polje
                oznaka={`Cijena ${i + 1} (€ bez PDV-a)`}
                inputMode="decimal"
                value={r.cijena}
                onChange={(e) => promijeni(r.kljuc, { cijena: e.target.value })}
              />
            ) : (
              <span />
            )}
            <Gumb
              varijanta="tihi"
              malen
              onClick={() => setRedovi((x) => (x.length > 1 ? x.filter((y) => y.kljuc !== r.kljuc) : x))}
              aria-label={`Ukloni stavku ${i + 1}`}
            >
              Ukloni
            </Gumb>
          </div>
        ))}
        <div>
          <Gumb
            malen
            onClick={() => setRedovi((x) => [...x, { kljuc: Math.max(...x.map((y) => y.kljuc)) + 1, model: null, kolicina: "1", cijena: "" }])}
          >
            + Stavka
          </Gumb>
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Napomena</span>
        <textarea className={klaseUnosa} rows={2} value={napomena} onChange={(e) => setNapomena(e.target.value)} />
      </label>
      {vidiCijene && <p className="text-sm font-medium">Ukupno bez PDV-a: {formatirajIznos(ukupno)} €</p>}
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      <div>
        <Gumb varijanta="primarni" onClick={spremi} disabled={uTijeku}>
          Spremi narudžbenicu
        </Gumb>
      </div>
    </div>
  );
}

export function Zaprimanje({
  narudzbenicaId,
  stavke,
  skladista,
  danas,
}: {
  narudzbenicaId: string;
  stavke: { id: string; naziv: string; preostalo: number }[];
  skladista: { id: string; naziv: string }[];
  danas: string;
}) {
  const [serijski, setSerijski] = useState<Record<string, string>>({});
  const [skladisteId, setSkladisteId] = useState(skladista[0]?.id ?? "");
  const [datum, setDatum] = useState(danas);
  const [dokument, setDokument] = useState("");
  const [trosak, setTrosak] = useState(false);
  const [stanje, setStanje] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  const popis = (id: string) => (serijski[id] ?? "").split(/[\s,;]+/).filter(Boolean);
  return (
    <div className="flex flex-col gap-3" data-testid="zaprimanje">
      <div className="grid gap-2 sm:grid-cols-3">
        <Odabir oznaka="Skladište" value={skladisteId} onChange={(e) => setSkladisteId(e.target.value)}>
          {skladista.map((s) => (
            <option key={s.id} value={s.id}>
              {s.naziv}
            </option>
          ))}
        </Odabir>
        <Polje oznaka="Datum primke" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        <Polje oznaka="Dokument dobavljača" value={dokument} onChange={(e) => setDokument(e.target.value)} />
      </div>
      {stavke
        .filter((s) => s.preostalo > 0)
        .map((s) => (
          <label key={s.id} className="flex flex-col gap-1">
            <span className="text-sm font-medium">
              {s.naziv} — još {s.preostalo} kom ({popis(s.id).length} upisano)
            </span>
            <textarea
              className={`${klaseUnosa} font-mono`}
              rows={2}
              aria-label={`Serijski brojevi: ${s.naziv}`}
              value={serijski[s.id] ?? ""}
              onChange={(e) => setSerijski((x) => ({ ...x, [s.id]: e.target.value }))}
            />
          </label>
        ))}
      <Kvacica oznaka="Knjiži nabavnu vrijednost u troškove" checked={trosak} onChange={(e) => setTrosak(e.target.checked)} />
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      <div>
        <Gumb
          varijanta="primarni"
          disabled={uTijeku}
          onClick={() =>
            zapocni(async () => {
              const r = await zaprimiAkcija(narudzbenicaId, {
                datum,
                skladisteId,
                dokumentDobavljaca: dokument || null,
                knjiziUTroskove: trosak,
                stavke: stavke.map((s) => ({ stavkaId: s.id, serijski: popis(s.id) })),
              });
              setStanje(r);
              if (r.ok) setSerijski({});
            })
          }
        >
          Zaprimi
        </Gumb>
      </div>
    </div>
  );
}

export function StatusNarudzbenice({ id, radnje }: { id: string; radnje: ("ZATVORI" | "STORNO" | "OTVORI")[] }) {
  const [stanje, setStanje] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  const naziv = { ZATVORI: "Zatvori (ostatak neće doći)", STORNO: "Storniraj", OTVORI: "Ponovno otvori" } as const;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {radnje.map((r) => (
          <Gumb
            key={r}
            malen
            varijanta={r === "STORNO" ? "opasni" : "sekundarni"}
            disabled={uTijeku}
            onClick={() => {
              if (r === "STORNO" && !confirm("Stornirati narudžbenicu?")) return;
              zapocni(async () => setStanje(await statusNarudzbeniceAkcija(id, r)));
            }}
          >
            {naziv[r]}
          </Gumb>
        ))}
      </div>
      {stanje && !stanje.ok && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
    </div>
  );
}
