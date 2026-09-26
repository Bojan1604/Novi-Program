"use client";

import { useActionState, useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Polje } from "@/components/ui/polje";
import { Znacka } from "@/components/ui/stranica";
import { aktivnostKlijentaAkcija, dodajKlijentaAkcija, lozinkaKlijentaAkcija, poveznicaKlijentaAkcija, type OdgovorPristupa } from "./portal-akcije";

export type KlijentPortala = { id: string; ime: string; email: string; aktivan: boolean; imaLozinku: boolean; zadnjaPrijava: string | null };

/** Jednokratni prikaz poveznice ili lozinke (kopiranje, e-pošta klijentu preko programa za poštu). */
function Tajna({ t }: { t: NonNullable<OdgovorPristupa["tajna"]> }) {
  // prikazuje se tek nakon akcije (samo u pregledniku), pa je window dostupan
  const adresa = t.vrsta === "poveznica" && typeof window !== "undefined" ? `${window.location.origin}${t.vrijednost}` : t.vrijednost;
  const tijelo =
    t.vrsta === "poveznica"
      ? `Poštovani,\n\nlozinku za portal klijenata postavite na poveznici (vrijedi 7 dana):\n${adresa}\n`
      : `Poštovani,\n\nvaša nova lozinka za portal klijenata je: ${adresa}\n`;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950"
      data-testid="tajna-portala"
    >
      <span>
        {t.vrsta === "poveznica" ? "Poveznica za postavljanje lozinke (prikazuje se samo sada):" : "Nova lozinka (prikazuje se samo sada):"}
      </span>
      <code className="break-all select-all" data-testid="tajna-vrijednost">
        {adresa}
      </code>
      <div className="flex flex-wrap gap-2">
        <Gumb malen onClick={() => void navigator.clipboard?.writeText(adresa)}>
          Kopiraj
        </Gumb>
        <a
          className="text-primarna hover:underline"
          href={`mailto:${t.za}?subject=${encodeURIComponent("Pristup portalu klijenata")}&body=${encodeURIComponent(tijelo)}`}
        >
          Pošalji e-poštom
        </a>
      </div>
    </div>
  );
}

function Poruka({ s }: { s: OdgovorPristupa | null | undefined }) {
  if (!s) return null;
  return (
    <div className="flex flex-col gap-2">
      {s.ok ? <Obavijest vrsta="uspjeh">{s.poruka}</Obavijest> : <Obavijest vrsta="greska">{s.greska}</Obavijest>}
      {s.ok && s.tajna && <Tajna t={s.tajna} />}
    </div>
  );
}

function RedakKlijenta({ partnerId, k, smije }: { partnerId: string; k: KlijentPortala; smije: boolean }) {
  const [stanje, setStanje] = useState<OdgovorPristupa | null>(null);
  const [uTijeku, zapocni] = useTransition();
  const radi = (fn: () => Promise<OdgovorPristupa>, potvrda?: string) => {
    if (potvrda && !confirm(potvrda)) return;
    zapocni(async () => setStanje(await fn()));
  };
  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          <div className="font-medium">
            {k.ime} <span className="break-all text-neutral-500">· {k.email}</span>
          </div>
          <div className="flex flex-wrap gap-1 text-xs text-neutral-500">
            {k.aktivan ? <Znacka boja="zelena">aktivan</Znacka> : <Znacka boja="crvena">isključen</Znacka>}
            {!k.imaLozinku && <Znacka boja="zuta">čeka lozinku</Znacka>}
            {k.zadnjaPrijava && <span>zadnja prijava {k.zadnjaPrijava}</span>}
          </div>
        </div>
        {smije && (
          <div className="flex flex-wrap gap-1">
            {k.aktivan ? (
              <>
                <Gumb malen disabled={uTijeku} onClick={() => radi(() => poveznicaKlijentaAkcija(partnerId, k.id, k.email))}>
                  Poveznica
                </Gumb>
                <Gumb
                  malen
                  disabled={uTijeku}
                  onClick={() => radi(() => lozinkaKlijentaAkcija(partnerId, k.id, k.email), "Postaviti novu lozinku? Klijent se odjavljuje.")}
                >
                  Nova lozinka
                </Gumb>
                <Gumb
                  malen
                  varijanta="opasni"
                  disabled={uTijeku}
                  onClick={() => radi(() => aktivnostKlijentaAkcija(partnerId, k.id, false), `Isključiti ${k.ime}? Odmah se odjavljuje.`)}
                >
                  Isključi
                </Gumb>
              </>
            ) : (
              <Gumb malen disabled={uTijeku} onClick={() => radi(() => aktivnostKlijentaAkcija(partnerId, k.id, true))}>
                Uključi
              </Gumb>
            )}
          </div>
        )}
      </div>
      <Poruka s={stanje} />
    </li>
  );
}

export function PristupPortalu({ partnerId, klijenti, smije }: { partnerId: string; klijenti: KlijentPortala[]; smije: boolean }) {
  const [stanje, posalji, uTijeku] = useActionState(dodajKlijentaAkcija.bind(null, partnerId), undefined);
  return (
    <div className="flex flex-col gap-3">
      {klijenti.length > 0 ? (
        <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="klijenti-portala">
          {klijenti.map((k) => (
            <RedakKlijenta key={`${k.id}-${k.aktivan}`} partnerId={partnerId} k={k} smije={smije} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">Nitko od partnera nema pristup portalu.</p>
      )}
      {smije && (
        <Obrazac
          akcija={posalji}
          className="flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800"
          aria-label="Novi klijent na portalu"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Polje oznaka="Ime i prezime" name="ime" required className="min-w-0 flex-1" />
            <Polje oznaka="E-pošta" name="email" type="email" required className="min-w-0 flex-1" />
            <Gumb type="submit" disabled={uTijeku}>
              Dodaj pristup
            </Gumb>
          </div>
          <Poruka s={stanje} />
        </Obrazac>
      )}
    </div>
  );
}
