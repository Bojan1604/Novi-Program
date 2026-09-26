"use client";

import { useActionState, useTransition, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa, Kvacica, Polje } from "@/components/ui/polje";
import { probnaPorukaAkcija, spremiPostavkeAkcija } from "./akcije";

export type Postavke = Record<string, string | number | boolean | null> & { imaLozinku: boolean };

export function ObrazacPostavki({ p, smije }: { p: Postavke; smije: boolean }) {
  const [stanje, posalji, uTijeku] = useActionState(spremiPostavkeAkcija, undefined);
  const [proba, setProba] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [saljem, zapocni] = useTransition();
  const g = (x: string) => (stanje && !stanje.ok ? stanje.polja?.[x] : undefined);
  const t = (x: string) => (p[x] === null || p[x] === undefined ? "" : String(p[x]));
  const naslov = (n: string) => <h2 className="mt-2 text-sm font-semibold sm:col-span-2">{n}</h2>;
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-4" aria-label="Postavke firme">
      <fieldset disabled={!smije || uTijeku} className="grid min-w-0 gap-3 sm:grid-cols-2">
        {naslov("Podaci na dokumentima")}
        <Polje oznaka="Adresa" name="adresa" defaultValue={t("adresa")} />
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <Polje oznaka="Pošt. broj" name="postanskiBroj" defaultValue={t("postanskiBroj")} />
          <Polje oznaka="Mjesto" name="mjesto" defaultValue={t("mjesto")} />
        </div>
        <Polje oznaka="E-pošta" name="email" defaultValue={t("email")} greska={g("email")} />
        <Polje oznaka="Telefon" name="telefon" defaultValue={t("telefon")} />
        <Polje oznaka="Web" name="web" defaultValue={t("web")} />
        <Polje oznaka="IBAN" name="iban" defaultValue={t("iban")} greska={g("iban")} />
        <Polje oznaka="Banka" name="banka" defaultValue={t("banka")} />
        <Polje
          oznaka="Zadani rok plaćanja (dana)"
          name="rokPlacanjaDana"
          inputMode="numeric"
          defaultValue={t("rokPlacanjaDana")}
          greska={g("rokPlacanjaDana")}
        />
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">Podnožje dokumenata</span>
          <textarea
            name="podnozje"
            defaultValue={t("podnozje")}
            rows={2}
            className={klaseUnosa}
            placeholder="npr. Trgovački sud, MBS, temeljni kapital"
          />
        </label>

        {naslov("Porez i fiskalizacija")}
        <Kvacica name="uSustavuPdv" oznaka="Firma je u sustavu PDV-a" defaultChecked={p["uSustavuPdv"] === true} />
        <Kvacica name="pdvPoNaplacenoj" oznaka="PDV po naplaćenoj naknadi" defaultChecked={p["pdvPoNaplacenoj"] === true} />
        <Polje
          oznaka="Oznaka poslovnog prostora"
          name="oznakaProstora"
          defaultValue={t("oznakaProstora")}
          greska={g("oznakaProstora")}
          opis="Dio broja računa: 12/PP1/1"
        />
        <Polje oznaka="Oznaka naplatnog uređaja" name="oznakaUredaja" defaultValue={t("oznakaUredaja")} greska={g("oznakaUredaja")} />

        {naslov("E-pošta (SMTP)")}
        <Polje oznaka="Poslužitelj (SMTP)" name="smtpHost" defaultValue={t("smtpHost")} placeholder="npr. smtp.gmail.com" />
        <Polje oznaka="Port" name="smtpPort" inputMode="numeric" defaultValue={t("smtpPort")} greska={g("smtpPort")} placeholder="465 ili 587" />
        <Polje oznaka="Korisničko ime" name="smtpKorisnik" defaultValue={t("smtpKorisnik")} autoComplete="off" />
        <Polje
          oznaka="Lozinka"
          name="smtpLozinka"
          type="password"
          autoComplete="new-password"
          placeholder={p.imaLozinku ? "•••••• (spremljena — upišite samo za promjenu)" : ""}
        />
        <Kvacica name="smtpSigurno" oznaka="Šifrirana veza (TLS)" defaultChecked={p["smtpSigurno"] === true} />
        {p.imaLozinku && <Kvacica name="obrisiLozinku" oznaka="Obriši spremljenu lozinku" />}
        <Polje oznaka="Pošiljatelj (From)" name="epostaPosiljatelj" defaultValue={t("epostaPosiljatelj")} greska={g("epostaPosiljatelj")} />
        <Polje oznaka="Skrivena kopija (Bcc)" name="epostaKopija" defaultValue={t("epostaKopija")} greska={g("epostaKopija")} />
      </fieldset>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      {proba && <Obavijest vrsta={proba.ok ? "uspjeh" : "greska"}>{proba.tekst}</Obavijest>}
      {smije && (
        <div className="flex flex-wrap gap-2">
          <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
            Spremi postavke
          </Gumb>
          <Gumb
            disabled={saljem}
            onClick={() =>
              zapocni(async () => {
                const r = await probnaPorukaAkcija();
                setProba(r.ok ? { ok: true, tekst: r.poruka } : { ok: false, tekst: r.greska });
              })
            }
          >
            Pošalji probnu poruku
          </Gumb>
        </div>
      )}
    </Obrazac>
  );
}
