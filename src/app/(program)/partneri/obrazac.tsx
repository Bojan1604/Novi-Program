"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Kvacica, Odabir, Polje } from "@/components/ui/polje";
import { usePoruke } from "@/components/ui/poruke";
import { DRZAVE } from "@/domain/drzave";
import { PDV_STATUSI } from "@/domain/partner";
import { dohvatiPodatkeAkcija, spremiPartneraAkcija } from "./akcije";

export type PocetniPartner = {
  naziv: string;
  kupac: boolean;
  dobavljac: boolean;
  drzava: string;
  oib: string;
  pdvBroj: string;
  adresa: string;
  postanskiBroj: string;
  mjesto: string;
  email: string;
  telefon: string;
  eRacunAdresa: string;
  pdvStatus: string;
  rokPlacanjaDana: string;
  cjenikId: string;
  napomena: string;
};

export function ObrazacPartnera({
  id,
  pocetno,
  cjenici,
  izvedeniStatus,
  smijeUredivati,
}: {
  id: string | null;
  pocetno: PocetniPartner;
  cjenici: { vrijednost: string; naziv: string }[];
  izvedeniStatus: string;
  smijeUredivati: boolean;
}) {
  const [stanje, posalji, uTijeku] = useActionState(spremiPartneraAkcija.bind(null, id), undefined);
  const [drzava, setDrzava] = useState(pocetno.drzava);
  const [dohvacam, zapocni] = useTransition();
  const poruka = usePoruke();
  const obrazac = useRef<HTMLFormElement>(null);
  const g = stanje && !stanje.ok ? stanje.polja : undefined;

  const polje = (ime: string) => obrazac.current?.elements.namedItem(ime) as HTMLInputElement | null;
  const dohvati = () =>
    zapocni(async () => {
      const r = await dohvatiPodatkeAkcija(drzava, polje("oib")?.value ?? "", polje("pdvBroj")?.value ?? "");
      if (!r.ok) {
        poruka(r.greska, "greska");
        return;
      }
      const podaci = r.podaci!;
      const postavi = (ime: string, v: string | null) => {
        const el = polje(ime);
        if (el && v && (!el.value || confirm(`Zamijeniti „${el.value}“ s „${v}“?`))) el.value = v;
      };
      postavi("naziv", podaci.naziv);
      postavi("adresa", podaci.adresa);
      postavi("postanskiBroj", podaci.postanskiBroj);
      postavi("mjesto", podaci.mjesto);
      poruka(r.poruka ?? "Podaci dohvaćeni.", "uspjeh");
    });

  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-4" noValidate ref={obrazac}>
      <fieldset disabled={!smijeUredivati || uTijeku} className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Polje oznaka="Naziv" name="naziv" defaultValue={pocetno.naziv} greska={g?.["naziv"]} required className="sm:col-span-2" />
          <div className="flex flex-wrap gap-x-6 sm:col-span-2">
            <Kvacica name="kupac" oznaka="Kupac" defaultChecked={pocetno.kupac} />
            <Kvacica name="dobavljac" oznaka="Dobavljač" defaultChecked={pocetno.dobavljac} />
            {g?.["kupac"] && <p className="w-full text-sm text-red-700 dark:text-red-400">{g["kupac"]}</p>}
          </div>
          <Odabir oznaka="Država" name="drzava" value={drzava} onChange={(e) => setDrzava(e.target.value)} greska={g?.["drzava"]}>
            {DRZAVE.map((d) => (
              <option key={d.kod} value={d.kod}>
                {d.naziv}
              </option>
            ))}
          </Odabir>
          {drzava === "HR" ? (
            <Polje oznaka="OIB" name="oib" defaultValue={pocetno.oib} greska={g?.["oib"]} inputMode="numeric" autoComplete="off" />
          ) : (
            <input type="hidden" name="oib" value="" />
          )}
          <Polje
            oznaka={drzava === "HR" ? "PDV broj (ako je u sustavu PDV-a)" : "PDV broj"}
            name="pdvBroj"
            defaultValue={pocetno.pdvBroj}
            greska={g?.["pdvBroj"]}
            opis={drzava === "HR" ? "HR + OIB" : "Npr. DE123456789"}
            autoComplete="off"
          />
          <div className="flex items-end">
            <Gumb onClick={dohvati} disabled={dohvacam}>
              {dohvacam ? "Dohvaćam…" : drzava === "HR" ? "Dohvati po OIB-u" : "Dohvati iz VIES-a"}
            </Gumb>
          </div>
          <Polje oznaka="Adresa" name="adresa" defaultValue={pocetno.adresa} greska={g?.["adresa"]} className="sm:col-span-2" />
          <Polje
            oznaka="Poštanski broj"
            name="postanskiBroj"
            defaultValue={pocetno.postanskiBroj}
            greska={g?.["postanskiBroj"]}
            inputMode="numeric"
          />
          <Polje oznaka="Mjesto" name="mjesto" defaultValue={pocetno.mjesto} greska={g?.["mjesto"]} />
          <Polje oznaka="E-pošta" name="email" type="email" defaultValue={pocetno.email} greska={g?.["email"]} />
          <Polje oznaka="Telefon" name="telefon" defaultValue={pocetno.telefon} greska={g?.["telefon"]} />
          <Polje
            oznaka="Adresa za eRačun"
            name="eRacunAdresa"
            defaultValue={pocetno.eRacunAdresa}
            greska={g?.["eRacunAdresa"]}
            opis="Za hrvatske tvrtke: OIB (upisuje se kao 9934:OIB)."
            autoComplete="off"
          />
          <Odabir oznaka="Porezni status (PDV)" name="pdvStatus" defaultValue={pocetno.pdvStatus} greska={g?.["pdvStatus"]}>
            <option value="">Prema državi i PDV broju ({izvedeniStatus})</option>
            {Object.entries(PDV_STATUSI).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Odabir>
          <Polje
            oznaka="Rok plaćanja (dana)"
            name="rokPlacanjaDana"
            defaultValue={pocetno.rokPlacanjaDana}
            greska={g?.["rokPlacanjaDana"]}
            inputMode="numeric"
          />
          <Odabir oznaka="Cjenik" name="cjenikId" defaultValue={pocetno.cjenikId} greska={g?.["cjenikId"]}>
            <option value="">Osnovne cijene</option>
            {cjenici.map((c) => (
              <option key={c.vrijednost} value={c.vrijednost}>
                {c.naziv}
              </option>
            ))}
          </Odabir>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium">Napomena</span>
            <textarea
              name="napomena"
              defaultValue={pocetno.napomena}
              rows={2}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900 sm:text-sm"
            />
          </label>
        </div>
        {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
        {smijeUredivati && (
          <div>
            <Gumb type="submit" varijanta="primarni">
              {id ? "Spremi" : "Dodaj partnera"}
            </Gumb>
          </div>
        )}
      </fieldset>
    </Obrazac>
  );
}
