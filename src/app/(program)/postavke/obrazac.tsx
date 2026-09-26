"use client";

import { useActionState, useTransition, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa, Kvacica, Odabir, Polje } from "@/components/ui/polje";
import { NACINI_FISKALIZACIJE } from "@/domain/fiskalizacija";
import { logoAkcija, pocetniBrojAkcija, probnaPorukaAkcija, spremiFiskalizacijuAkcija, spremiPostavkeAkcija } from "./akcije";

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
        <Polje oznaka="Naziv firme" name="naziv" required defaultValue={t("naziv")} greska={g("naziv")} />
        <Polje oznaka="OIB firme" name="oib" required inputMode="numeric" maxLength={11} defaultValue={t("oib")} greska={g("oib")} />
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

        {naslov("Izgled i KPD")}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Boja firme (sučelje i dokumenti)</span>
          <input type="color" name="boja" defaultValue={t("boja") || "#0f766e"} className="h-10 w-20 rounded border border-neutral-300" />
          {g("boja") && <span className="text-sm text-red-700">{g("boja")}</span>}
        </label>
        <Polje
          oznaka="Zadani KPD za robu"
          name="kpdRoba"
          defaultValue={t("kpdRoba")}
          greska={g("kpdRoba")}
          placeholder="npr. 26.20.11"
          opis="Kad model nema KPD"
        />
        <Polje oznaka="Zadani KPD za usluge" name="kpdUsluga" defaultValue={t("kpdUsluga")} greska={g("kpdUsluga")} />
        <Polje oznaka="Zadani KPD za najam" name="kpdNajam" defaultValue={t("kpdNajam")} greska={g("kpdNajam")} />

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

export function ObrazacFiskalizacije({
  nacin,
  certifikat,
  smije,
}: {
  nacin: string;
  certifikat: { naziv: string; vrijediDo: string } | null;
  smije: boolean;
}) {
  const [stanje, posalji, uTijeku] = useActionState(spremiFiskalizacijuAkcija, undefined);
  const g = (x: string) => (stanje && !stanje.ok ? stanje.polja?.[x] : undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-4" aria-label="Fiskalizacija">
      <fieldset disabled={!smije || uTijeku} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Odabir oznaka="Način fiskalizacije" name="fiskalNacin" defaultValue={nacin} greska={g("fiskalNacin")}>
          {Object.entries(NACINI_FISKALIZACIJE).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </Odabir>
        <p className="self-end text-sm text-neutral-600 dark:text-neutral-400" data-testid="certifikat">
          {certifikat
            ? `Certifikat: ${certifikat.naziv}, vrijedi do ${new Date(certifikat.vrijediDo).toLocaleDateString("hr-HR")}`
            : "Certifikat nije učitan."}
        </p>
        <Polje
          oznaka="Novi certifikat (.p12 / .pfx)"
          name="certifikat"
          type="file"
          accept=".p12,.pfx,application/x-pkcs12"
          greska={g("certifikat")}
          opis="FINA aplikacijski certifikat za fiskalizaciju"
        />
        <Polje oznaka="Lozinka certifikata" name="lozinkaCertifikata" type="password" autoComplete="off" />
      </fieldset>
      <p className="text-xs text-neutral-500">
        Fiskaliziraju se računi plaćeni gotovinom, karticom ili „ostalo“ i računi građanima. Ako CIS ne odgovori, račun je ipak izdan i šalje se
        ponovno automatski (naknadna dostava). OIB operatera upisuje se kod korisnika.
      </p>
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
      {smije && (
        <div>
          <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
            Spremi fiskalizaciju
          </Gumb>
        </div>
      )}
    </Obrazac>
  );
}

export function ObrazacLoga({ logo, smije }: { logo: string | null; smije: boolean }) {
  const [stanje, posalji, uTijeku] = useActionState(logoAkcija, undefined);
  return (
    <div className="flex flex-col gap-3">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo iz baze (data URL)
        <img src={logo} alt="Logo firme" className="max-h-16 max-w-60 object-contain" data-testid="logo-firme" />
      ) : (
        <p className="text-sm text-neutral-500">Logo nije postavljen.</p>
      )}
      {smije && (
        <Obrazac akcija={posalji} className="flex flex-col gap-2 sm:flex-row sm:items-end" aria-label="Logo firme">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
            Slika (PNG ili JPEG, do 500 KB)
            <input type="file" name="logo" accept="image/png,image/jpeg" className={klaseUnosa} />
          </label>
          <Gumb type="submit" disabled={uTijeku}>
            Spremi logo
          </Gumb>
          {logo && (
            <Gumb type="submit" name="ukloni" value="1" varijanta="tihi" disabled={uTijeku}>
              Ukloni
            </Gumb>
          )}
        </Obrazac>
      )}
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </div>
  );
}

export function ObrazacBrojeva({
  nizovi,
  godina,
  smije,
}: {
  nizovi: { vrsta: string; naziv: string; zadnji: number }[];
  godina: number;
  smije: boolean;
}) {
  const [stanje, posalji, uTijeku] = useActionState(pocetniBrojAkcija, undefined);
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="nizovi-brojeva">
        {nizovi.map((n) => (
          <li key={n.vrsta} className="flex justify-between gap-2 py-1.5">
            <span>{n.naziv}</span>
            <span className="text-neutral-500">
              {godina}.: zadnji {n.zadnji || "—"}, sljedeći {n.zadnji + 1}
            </span>
          </li>
        ))}
      </ul>
      {smije && (
        <Obrazac akcija={posalji} className="flex flex-col gap-2 sm:flex-row sm:items-end" aria-label="Početni broj">
          <Odabir oznaka="Niz" name="vrsta">
            {nizovi.map((n) => (
              <option key={n.vrsta} value={n.vrsta}>
                {n.naziv}
              </option>
            ))}
          </Odabir>
          <Polje oznaka="Godina" name="godina" inputMode="numeric" defaultValue={String(godina)} className="sm:w-24" />
          <Polje oznaka="Sljedeći broj" name="pocetni" inputMode="numeric" required className="sm:w-32" />
          <Gumb type="submit" disabled={uTijeku}>
            Postavi
          </Gumb>
        </Obrazac>
      )}
      {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
    </div>
  );
}
