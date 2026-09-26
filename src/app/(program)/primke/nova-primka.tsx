"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Kvacica, Odabir, Polje, klaseUnosa } from "@/components/ui/polje";
import { GumbiSkenera } from "@/components/ui/skener";
import { Pretrazivac } from "@/components/ui/pretrazivac";
import type { Stavka } from "@/components/ui/pretrazivac-stanje";
import { formatirajIznos, procitajIznos } from "@/domain/novac";
import { procitajSerijske } from "@/domain/zaprimanje";
import { provjeriSerijskeAkcija, zaprimiAkcija } from "./akcije";

type Red = { serijski: string; model: Stavka; nabavna: number | null; cpu: string; ram: string; disk: string; ekran: string; os: string };

export function NovaPrimka({
  danas,
  skladista,
  stanja,
  vidiNabavne,
}: {
  danas: string;
  skladista: { id: string; naziv: string; zadano: boolean }[];
  stanja: { id: string; naziv: string }[];
  vidiNabavne: boolean;
}) {
  const [stanje, posalji, uTijeku] = useActionState(zaprimiAkcija, undefined);
  const [redovi, setRedovi] = useState<Red[]>([]);
  const [model, setModel] = useState<Stavka | null>(null);
  const [dobavljac, setDobavljac] = useState<Stavka | null>(null);
  const [nabavna, setNabavna] = useState("");
  const [spec, setSpec] = useState({ cpu: "", ram: "", disk: "", ekran: "", os: "" });
  const [zalijepi, setZalijepi] = useState("");
  const [greske, setGreske] = useState<string[]>([]);
  const [postojeci, setPostojeci] = useState<Map<string, string>>(new Map());
  const skener = useRef<HTMLInputElement>(null);
  const zaglavlje = useRef<HTMLFormElement>(null);

  // provjera koji su serijski već u programu (s kratkom stankom)
  const popis = redovi.map((r) => r.serijski).join("\n");
  useEffect(() => {
    if (!popis) return;
    // odgovor za stari popis se odbacuje (sporiji raniji zahtjev ne smije prepisati noviji);
    // upozorenja se ionako prikazuju samo za serijske koji su još na popisu
    let vazece = true;
    const t = setTimeout(async () => {
      const r = await provjeriSerijskeAkcija(popis.split("\n"));
      if (vazece && r.ok) setPostojeci(new Map(r.podaci!.map((p) => [p.serijski, p.primka ?? p.stanje])));
    }, 400);
    return () => {
      vazece = false;
      clearTimeout(t);
    };
  }, [popis]);

  const nabavnaCenti = (): number | null | "greska" => {
    if (!vidiNabavne || !nabavna.trim()) return null;
    const r = procitajIznos(nabavna);
    return r.ok ? r.vrijednost : "greska";
  };

  const dodaj = (tekst: string): boolean => {
    if (!model) {
      setGreske(["Prvo odaberite model uređaja."]);
      return false;
    }
    const cijena = nabavnaCenti();
    if (cijena === "greska") {
      setGreske(["Nabavna cijena nije ispravan iznos."]);
      return false;
    }
    const procitano = procitajSerijske(tekst);
    const nove: Red[] = [];
    const gr: string[] = [];
    const vec = new Set(redovi.map((r) => r.serijski));
    for (const p of procitano) {
      if (p.greska && !p.serijski) gr.push(`Redak ${p.red}: ${p.greska}`);
      else if (p.serijski && (vec.has(p.serijski) || p.greska)) gr.push(`${p.serijski} je već na popisu.`);
      else if (p.serijski) {
        vec.add(p.serijski);
        nove.push({ serijski: p.serijski, model, nabavna: cijena, ...spec });
      }
    }
    setGreske(gr);
    if (nove.length) setRedovi((r) => [...r, ...nove]);
    return nove.length > 0 || gr.length === 0;
  };

  const posaljiPrimku = () => {
    const f = zaglavlje.current!;
    const v = (ime: string) => (f.elements.namedItem(ime) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
    const fd = new FormData();
    fd.set(
      "podaci",
      JSON.stringify({
        datum: v("datum"),
        skladisteId: v("skladisteId"),
        dobavljacId: dobavljac?.id ?? null,
        stanjeRobeId: v("stanjeRobeId") || null,
        dokumentDobavljaca: v("dokumentDobavljaca") || null,
        napomena: v("napomena") || null,
        knjiziUTroskove: (f.elements.namedItem("knjiziUTroskove") as HTMLInputElement | null)?.checked ?? false,
        stavke: redovi.map((r) => ({
          serijski: r.serijski,
          modelId: r.model.id,
          nabavnaCijena: r.nabavna,
          cpu: r.cpu,
          ram: r.ram,
          disk: r.disk,
          ekran: r.ekran,
          os: r.os,
        })),
      }),
    );
    startTransition(() => posalji(fd));
  };

  const zauzeti = redovi.filter((r) => postojeci.has(r.serijski));
  const ukupno = redovi.reduce((a, r) => a + (r.nabavna ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <form ref={zaglavlje} onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Polje oznaka="Datum" name="datum" type="date" defaultValue={danas} max={danas} required />
        <Odabir oznaka="Skladište" name="skladisteId" defaultValue={skladista.find((s) => s.zadano)?.id ?? skladista[0]?.id}>
          {skladista.map((s) => (
            <option key={s.id} value={s.id}>
              {s.naziv}
            </option>
          ))}
        </Odabir>
        <Pretrazivac izvor="/api/odabir/partneri?vrsta=dobavljac" oznaka="Dobavljač" onPromjena={setDobavljac} />
        <Polje oznaka="Dokument dobavljača" name="dokumentDobavljaca" placeholder="Otpremnica / račun" />
        <Odabir oznaka="Stanje robe" name="stanjeRobeId" defaultValue="">
          <option value="">—</option>
          {stanja.map((s) => (
            <option key={s.id} value={s.id}>
              {s.naziv}
            </option>
          ))}
        </Odabir>
        <Kvacica name="knjiziUTroskove" oznaka="Knjiži u troškove" className="sm:mt-6" />
        <Polje oznaka="Napomena" name="napomena" className="sm:col-span-2 lg:col-span-3" />
      </form>

      <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800" aria-label="Uređaji za zaprimanje">
        <h2 className="mb-2 font-semibold">Uređaji</h2>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Odaberite model (i po želji nabavnu cijenu i specifikaciju), zatim skenirajte serijske brojeve ili zalijepite stupac. Model se može
          promijeniti usred skeniranja.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Pretrazivac izvor="/api/odabir/modeli" oznaka="Model" onPromjena={setModel} />
          </div>
          {vidiNabavne && (
            <Polje oznaka="Nabavna cijena (€, bez PDV-a)" value={nabavna} onChange={(e) => setNabavna(e.target.value)} inputMode="decimal" />
          )}
          {(["cpu", "ram", "disk", "ekran", "os"] as const).map((k) => (
            <Polje
              key={k}
              oznaka={{ cpu: "Procesor", ram: "RAM", disk: "Disk", ekran: "Ekran", os: "Operativni sustav" }[k]}
              value={spec[k]}
              onChange={(e) => setSpec((s) => ({ ...s, [k]: e.target.value }))}
            />
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Skener / upis (Enter dodaje)</span>
              <input
                ref={skener}
                className={klaseUnosa}
                placeholder="Skenirajte serijski broj…"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const el = e.currentTarget;
                  if (el.value.trim() && dodaj(el.value)) el.value = "";
                }}
                aria-label="Skener"
              />
            </label>
            <GumbiSkenera skupno onSerijski={(sn) => dodaj(sn)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Zalijepite stupac serijskih brojeva</span>
              <textarea
                className={klaseUnosa}
                rows={3}
                value={zalijepi}
                onChange={(e) => setZalijepi(e.target.value)}
                placeholder={"PF3ABC12\nPF3ABC13\n…"}
              />
            </label>
            <div>
              <Gumb malen onClick={() => dodaj(zalijepi) && setZalijepi("")}>
                Dodaj zalijepljene
              </Gumb>
            </div>
          </div>
        </div>
        {greske.length > 0 && (
          <div className="mt-3">
            <Obavijest vrsta="greska">
              <ul>
                {greske.slice(0, 10).map((g) => (
                  <li key={g}>{g}</li>
                ))}
                {greske.length > 10 && <li>… i još {greske.length - 10}</li>}
              </ul>
            </Obavijest>
          </div>
        )}
        {zauzeti.length > 0 && (
          <div className="mt-3">
            <Obavijest vrsta="upozorenje">
              Već u programu: {zauzeti.map((r) => `${r.serijski} (${postojeci.get(r.serijski)})`).join(", ")}. Uklonite ih s popisa.
            </Obavijest>
          </div>
        )}
        <div className="mt-3 max-h-96 overflow-auto">
          <table className="w-full text-sm" data-testid="stavke-primke">
            <thead className="sticky top-0 bg-pozadina">
              <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Serijski</th>
                <th className="py-1.5 pr-2 font-medium">Model</th>
                {vidiNabavne && <th className="py-1.5 pr-2 text-right font-medium">Nabavna</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {redovi.map((r, i) => (
                <tr
                  key={r.serijski}
                  className={`border-b border-neutral-100 dark:border-neutral-900 ${postojeci.has(r.serijski) ? "bg-red-50 dark:bg-red-950" : ""}`}
                >
                  <td className="py-1 pr-2 text-neutral-500">{i + 1}</td>
                  <td className="py-1 pr-2 font-mono">{r.serijski}</td>
                  <td className="py-1 pr-2">{r.model.naziv}</td>
                  {vidiNabavne && <td className="py-1 pr-2 text-right tabular-nums">{r.nabavna === null ? "" : formatirajIznos(r.nabavna)}</td>}
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      className="px-2 text-neutral-500 hover:text-red-700"
                      aria-label={`Ukloni ${r.serijski}`}
                      onClick={() => setRedovi((x) => x.filter((y) => y.serijski !== r.serijski))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {redovi.length === 0 && <p className="py-4 text-center text-sm text-neutral-500">Još nema uređaja.</p>}
        </div>
        <div className="mt-2 text-sm">
          Ukupno: <strong data-testid="broj-uredaja">{redovi.length}</strong> uređaja
          {vidiNabavne && ukupno > 0 && <> · nabavno {formatirajIznos(ukupno)} €</>}
        </div>
      </section>

      {stanje && !stanje.ok && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
      <div>
        <Gumb varijanta="primarni" disabled={uTijeku || redovi.length === 0 || zauzeti.length > 0} onClick={posaljiPrimku}>
          {uTijeku ? "Zaprimam…" : `Zaprimi ${redovi.length} uređaja`}
        </Gumb>
      </div>
    </div>
  );
}
