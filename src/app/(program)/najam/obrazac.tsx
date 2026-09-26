"use client";

import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa, Odabir, Polje } from "@/components/ui/polje";
import { Pretrazivac } from "@/components/ui/pretrazivac";
import { NACINI_PLACANJA } from "@/domain/prodaja";
import { otkaziUgovorAkcija, spremiUgovorAkcija } from "./akcije";

export type PocetniUgovor = {
  id: string | null;
  verzija: number;
  broj: string;
  partner: { id: string; naziv: string } | null;
  poslovnicaId: string | null;
  poslovnice: { id: string; naziv: string }[];
  od: string;
  do: string;
  rokPlacanjaDana: number;
  nacinPlacanja: string;
  uvjeti: string;
  napomenaRacuna: string;
};

export function ObrazacUgovora({ p, smije }: { p: PocetniUgovor; smije: boolean }) {
  const [stanje, posalji, uTijeku] = useActionState(spremiUgovorAkcija.bind(null, p.id), undefined);
  const g = (x: string) => (stanje && !stanje.ok ? stanje.polja?.[x] : undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-4" aria-label="Ugovor o najmu">
      <input type="hidden" name="verzija" value={p.verzija} />
      <fieldset disabled={!smije || uTijeku} className="grid min-w-0 gap-3 sm:grid-cols-2">
        {p.id ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Kupac</span>
            <input type="hidden" name="partnerId" value={p.partner?.id ?? ""} />
            <span className="py-2 text-sm">{p.partner?.naziv}</span>
          </div>
        ) : (
          <Pretrazivac
            izvor="/api/odabir/partneri?vrsta=kupac"
            oznaka="Kupac"
            name="partnerId"
            pocetna={p.partner}
            greska={g("partnerId")}
            obavezno
          />
        )}
        {p.poslovnice.length > 0 ? (
          <Odabir oznaka="Poslovnica" name="poslovnicaId" defaultValue={p.poslovnicaId ?? ""} greska={g("poslovnicaId")}>
            <option value="">—</option>
            {p.poslovnice.map((x) => (
              <option key={x.id} value={x.id}>
                {x.naziv}
              </option>
            ))}
          </Odabir>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Polje oznaka="Početak" name="od" type="date" required defaultValue={p.od} greska={g("od")} />
        <Polje oznaka="Kraj (prazno = na neodređeno)" name="do" type="date" defaultValue={p.do} greska={g("do")} />
        <Polje
          oznaka="Broj ugovora"
          name="broj"
          defaultValue={p.id ? p.broj : ""}
          placeholder={p.id ? undefined : "automatski (NU-1/2026)"}
          greska={g("broj")}
          opis="Upišite samo za postojeći papirnati ugovor; ne troši automatsku numeraciju."
        />
        <div className="grid grid-cols-2 gap-2">
          <Polje
            oznaka="Rok plaćanja (dana)"
            name="rokPlacanjaDana"
            inputMode="numeric"
            defaultValue={String(p.rokPlacanjaDana)}
            greska={g("rokPlacanjaDana")}
          />
          <Odabir oznaka="Način plaćanja" name="nacinPlacanja" defaultValue={p.nacinPlacanja}>
            {Object.entries(NACINI_PLACANJA).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </Odabir>
        </div>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">Uvjeti ugovora</span>
          <textarea
            name="uvjeti"
            rows={3}
            defaultValue={p.uvjeti}
            className={klaseUnosa}
            placeholder="npr. otkazni rok, jamstvo, servis, osiguranje"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">Napomena na računima za najam</span>
          <textarea name="napomenaRacuna" rows={2} defaultValue={p.napomenaRacuna} className={klaseUnosa} />
        </label>
      </fieldset>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      {smije && (
        <div>
          <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
            {p.id ? "Spremi ugovor" : "Otvori ugovor"}
          </Gumb>
        </div>
      )}
    </Obrazac>
  );
}

export function OtkazUgovora({ id, otkazan, razlog, danas }: { id: string; otkazan: string | null; razlog: string | null; danas: string }) {
  const [stanje, posalji, uTijeku] = useActionState(otkaziUgovorAkcija.bind(null, id), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label="Otkaz ugovora">
      {otkazan ? (
        <>
          <p className="text-sm">
            Otkazan od {otkazan.split("-").reverse().join(".")}.{razlog ? ` — ${razlog}` : ""}
          </p>
          <input type="hidden" name="ponisti" value="1" />
          <div>
            <Gumb type="submit" disabled={uTijeku}>
              Poništi otkaz
            </Gumb>
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
          <Polje oznaka="Otkaz od (zadnji dan naplate)" name="datumOtkaza" type="date" required defaultValue={danas} />
          <Polje oznaka="Razlog" name="razlogOtkaza" />
          <Gumb type="submit" varijanta="opasni" disabled={uTijeku}>
            Otkaži ugovor
          </Gumb>
        </div>
      )}
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </Obrazac>
  );
}
