"use client";

import { useActionState, useState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Kvacica, Odabir, Polje } from "@/components/ui/polje";
import { Pretrazivac } from "@/components/ui/pretrazivac";
import { formatirajIznos } from "@/domain/novac";
import { postaviCijenuAkcija, spremiCjenikAkcija } from "./akcije";

export function ObrazacCjenika({
  id,
  naziv,
  opis,
  popust,
  aktivan,
  smijeUredivati,
}: {
  id: string | null;
  naziv: string;
  opis: string;
  popust: number | null;
  aktivan: boolean;
  smijeUredivati: boolean;
}) {
  const [stanje, posalji, uTijeku] = useActionState(spremiCjenikAkcija.bind(null, id), undefined);
  const g = stanje && !stanje.ok ? stanje.polja : undefined;
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" noValidate>
      <fieldset disabled={!smijeUredivati || uTijeku} className="flex min-w-0 flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Polje oznaka="Naziv" name="naziv" defaultValue={naziv} required />
          <Polje
            oznaka="Popust na osnovne cijene (%)"
            name="popust"
            defaultValue={popust === null ? "" : formatirajIznos(popust)}
            greska={g?.["popust"]}
            opis="Za modele i usluge koji nisu u cjeniku."
            inputMode="decimal"
          />
          <Polje oznaka="Opis" name="opis" defaultValue={opis} className="sm:col-span-2" />
        </div>
        {id && <Kvacica name="aktivan" oznaka="Aktivan" defaultChecked={aktivan} />}
        {stanje && (stanje.ok ? <Obavijest vrsta="uspjeh">{stanje.poruka}</Obavijest> : <Obavijest vrsta="greska">{stanje.greska}</Obavijest>)}
        {smijeUredivati && (
          <div>
            <Gumb type="submit" varijanta="primarni">
              {id ? "Spremi" : "Napravi cjenik"}
            </Gumb>
          </div>
        )}
      </fieldset>
    </Obrazac>
  );
}

export function NovaCijena({ cjenikId }: { cjenikId: string }) {
  const [vrsta, setVrsta] = useState<"model" | "usluga">("model");
  const [kljuc, setKljuc] = useState(0);
  const [stanje, posalji, uTijeku] = useActionState(async (p: Awaited<ReturnType<typeof postaviCijenuAkcija>> | undefined, fd: FormData) => {
    const r = await postaviCijenuAkcija(cjenikId, p, fd);
    if (r.ok) setKljuc((x) => x + 1);
    return r;
  }, undefined);
  return (
    <Obrazac akcija={posalji} className="grid gap-3 sm:grid-cols-[10rem_1fr_10rem_auto] sm:items-end" key={kljuc}>
      <Odabir oznaka="Vrsta" name="vrsta" value={vrsta} onChange={(e) => setVrsta(e.target.value as "model" | "usluga")}>
        <option value="model">Model</option>
        <option value="usluga">Usluga</option>
      </Odabir>
      <Pretrazivac
        key={vrsta}
        izvor={`/api/odabir/${vrsta === "model" ? "modeli" : "usluge"}`}
        name="artiklId"
        oznaka={vrsta === "model" ? "Model" : "Usluga"}
        obavezno
      />
      <Polje oznaka="Cijena (€, bez PDV-a)" name="cijena" inputMode="decimal" greska={stanje && !stanje.ok ? stanje.polja?.["cijena"] : undefined} />
      <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
        Dodaj
      </Gumb>
      {stanje && !stanje.ok && !stanje.polja && (
        <div className="sm:col-span-4">
          <Obavijest vrsta="greska">{stanje.greska}</Obavijest>
        </div>
      )}
    </Obrazac>
  );
}

export function UkloniCijenu({ cjenikId, vrsta, artiklId }: { cjenikId: string; vrsta: "model" | "usluga"; artiklId: string }) {
  const [, posalji, uTijeku] = useActionState(postaviCijenuAkcija.bind(null, cjenikId), undefined);
  return (
    <Obrazac akcija={posalji}>
      <input type="hidden" name="vrsta" value={vrsta} />
      <input type="hidden" name="artiklId" value={artiklId} />
      <input type="hidden" name="ukloni" value="1" />
      <Gumb type="submit" malen varijanta="tihi" disabled={uTijeku} aria-label="Ukloni cijenu">
        Ukloni
      </Gumb>
    </Obrazac>
  );
}
