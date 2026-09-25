"use client";

import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Kvacica, Odabir, Polje } from "@/components/ui/polje";
import { MODULI, NAZIVI_RAZINA, POSEBNA, POPIS_MODULA, POPIS_POSEBNIH, RAZINE, type Iznimke, type Prava } from "@/domain/prava";
import type { Odgovor } from "@/lib/greske";
import { dodajKorisnikaAkcija, postaviLozinkuAkcija, urediKorisnikaAkcija } from "./akcije";

type Uloga = { id: string; naziv: string };

function Poruka({ stanje }: { stanje: Odgovor<unknown> | undefined }) {
  if (!stanje) return null;
  return stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>;
}

export function DodajKorisnika({ uloge }: { uloge: Uloga[] }) {
  const [stanje, akcija, uTijeku] = useActionState(dodajKorisnikaAkcija, undefined);
  return (
    <form action={akcija} className="grid gap-3 sm:grid-cols-2" key={stanje?.ok ? "novi" : "isti"}>
      <Polje oznaka="Ime i prezime" name="ime" required autoComplete="off" />
      <Polje oznaka="E-pošta" name="email" type="email" required autoComplete="off" />
      <Polje oznaka="Početna lozinka" name="lozinka" type="password" autoComplete="new-password" opis="Najmanje 10 znakova. Ne treba ako korisnik već radi u drugoj firmi." />
      <Odabir oznaka="Uloga" name="ulogaId" required defaultValue="">
        <option value="" disabled>
          Odaberite…
        </option>
        {uloge.map((u) => (
          <option key={u.id} value={u.id}>
            {u.naziv}
          </option>
        ))}
      </Odabir>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Poruka stanje={stanje} />
        <div>
          <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
            Dodaj korisnika
          </Gumb>
        </div>
      </div>
    </form>
  );
}

export function UrediKorisnika({
  korisnikId,
  ime,
  aktivno,
  ulogaId,
  uloge,
  iznimke,
  pravaUloge,
  smijeUredivati,
}: {
  korisnikId: string;
  ime: string;
  aktivno: boolean;
  ulogaId: string;
  uloge: Uloga[];
  iznimke: Iznimke;
  pravaUloge: Prava;
  smijeUredivati: boolean;
}) {
  const [stanje, akcija, uTijeku] = useActionState(urediKorisnikaAkcija.bind(null, korisnikId), undefined);
  return (
    <form action={akcija} className="flex flex-col gap-4">
      <fieldset disabled={!smijeUredivati || uTijeku} className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Polje oznaka="Ime i prezime" name="ime" defaultValue={ime} required />
          <Odabir oznaka="Uloga" name="ulogaId" defaultValue={ulogaId}>
            {uloge.map((u) => (
              <option key={u.id} value={u.id}>
                {u.naziv}
              </option>
            ))}
          </Odabir>
        </div>
        <Kvacica name="aktivno" oznaka="Aktivan (može se prijaviti)" defaultChecked={aktivno} />
        <details className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800" open={Object.keys(iznimke).length > 0}>
          <summary className="cursor-pointer text-sm font-medium">Iznimke u odnosu na ulogu</summary>
          <p className="mt-2 mb-3 text-xs text-neutral-500">„Prema ulozi“ znači da vrijedi pravo uloge (prikazano u zagradi).</p>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {POPIS_MODULA.map((m) => (
              <Odabir key={m} oznaka={MODULI[m]} name={`iznimka.modul.${m}`} defaultValue={iznimke.moduli?.[m] ?? ""}>
                <option value="">Prema ulozi ({NAZIVI_RAZINA[pravaUloge.moduli[m]]})</option>
                {RAZINE.map((r) => (
                  <option key={r} value={r}>
                    {NAZIVI_RAZINA[r]}
                  </option>
                ))}
              </Odabir>
            ))}
            {POPIS_POSEBNIH.map((p) => {
              const v = iznimke.posebna?.[p];
              return (
                <Odabir key={p} oznaka={POSEBNA[p]} name={`iznimka.posebno.${p}`} defaultValue={v === undefined ? "" : v ? "da" : "ne"}>
                  <option value="">Prema ulozi ({pravaUloge.posebna[p] ? "da" : "ne"})</option>
                  <option value="da">Da</option>
                  <option value="ne">Ne</option>
                </Odabir>
              );
            })}
          </div>
        </details>
        <Poruka stanje={stanje} />
        {smijeUredivati && (
          <div>
            <Gumb type="submit" varijanta="primarni">
              Spremi
            </Gumb>
          </div>
        )}
      </fieldset>
    </form>
  );
}

export function NovaLozinka({ korisnikId }: { korisnikId: string }) {
  const [stanje, akcija, uTijeku] = useActionState(postaviLozinkuAkcija.bind(null, korisnikId), undefined);
  return (
    <form action={akcija} className="flex flex-col gap-3" key={stanje?.ok ? "ok" : "forma"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka="Nova lozinka" name="lozinka" type="password" autoComplete="new-password" required />
        <Polje oznaka="Ponovite lozinku" name="ponovljena" type="password" autoComplete="new-password" required />
      </div>
      <Poruka stanje={stanje} />
      <div>
        <Gumb type="submit" disabled={uTijeku}>
          Postavi lozinku
        </Gumb>
      </div>
    </form>
  );
}
