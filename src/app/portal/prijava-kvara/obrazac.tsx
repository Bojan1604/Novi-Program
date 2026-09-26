"use client";

import { useActionState, useId, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa, Odabir, Polje } from "@/components/ui/polje";
import { NAJVECI_PRILOG } from "@/domain/prilozi";
import { prijavaKvaraAkcija } from "../nalozi/akcije";

export function PrijavaKvara({ uredaji, odabran }: { uredaji: { id: string; naziv: string }[]; odabran: string }) {
  const [stanje, posalji, uTijeku] = useActionState(prijavaKvaraAkcija, undefined);
  const [greskaSlika, setGreskaSlika] = useState<string | null>(null);
  const idOpisa = useId();
  const idSlika = useId();
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label="Prijava kvara">
      <Odabir oznaka="Uređaj" name="uredajId" required defaultValue={odabran}>
        <option value="">— odaberite —</option>
        {uredaji.map((u) => (
          <option key={u.id} value={u.id}>
            {u.naziv}
          </option>
        ))}
      </Odabir>
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={idOpisa} className="text-sm font-medium">
          Opis kvara
        </label>
        <textarea id={idOpisa} name="opisKvara" rows={4} required maxLength={2000} className={klaseUnosa} />
      </div>
      <Polje oznaka="Kontakt (osoba, telefon)" name="kontakt" maxLength={200} />
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={idSlika} className="text-sm font-medium">
          Fotografije (do 4, najviše 10 MB svaka)
        </label>
        <input
          id={idSlika}
          type="file"
          name="fotografije"
          accept="image/*"
          multiple
          className={klaseUnosa}
          onChange={(e) => {
            const f = [...(e.currentTarget.files ?? [])];
            setGreskaSlika(f.length > 4 ? "Najviše 4 fotografije." : f.some((x) => x.size > NAJVECI_PRILOG) ? "Fotografija je veća od 10 MB." : null);
          }}
        />
      </div>
      {greskaSlika && <Obavijest vrsta="greska">{greskaSlika}</Obavijest>}
      {stanje && !stanje.ok && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku || !!greskaSlika}>
          {uTijeku ? "Šaljem…" : "Pošalji prijavu"}
        </Gumb>
      </div>
    </Obrazac>
  );
}
