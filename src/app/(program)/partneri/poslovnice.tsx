"use client";

import { useActionState, useState, useTransition } from "react";
import { Dijalog } from "@/components/ui/dijalog";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Polje } from "@/components/ui/polje";
import { usePoruke } from "@/components/ui/poruke";
import { Znacka } from "@/components/ui/stranica";
import { aktivnostPoslovniceAkcija, spremiPoslovnicuAkcija } from "./akcije";

type Poslovnica = {
  id: string;
  naziv: string;
  adresa: string | null;
  postanskiBroj: string | null;
  mjesto: string | null;
  kontakt: string | null;
  telefon: string | null;
  aktivan: boolean;
};

function ObrazacPoslovnice({ partnerId, p, onGotovo }: { partnerId: string; p: Poslovnica | null; onGotovo: () => void }) {
  const [stanje, posalji, uTijeku] = useActionState(async (prije: Awaited<ReturnType<typeof spremiPoslovnicuAkcija>> | undefined, fd: FormData) => {
    const r = await spremiPoslovnicuAkcija(partnerId, p?.id ?? null, prije, fd);
    if (r.ok) onGotovo();
    return r;
  }, undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3">
      <Polje oznaka="Naziv poslovnice" name="naziv" defaultValue={p?.naziv ?? ""} required autoFocus />
      <Polje oznaka="Adresa" name="adresa" defaultValue={p?.adresa ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka="Poštanski broj" name="postanskiBroj" defaultValue={p?.postanskiBroj ?? ""} />
        <Polje oznaka="Mjesto" name="mjesto" defaultValue={p?.mjesto ?? ""} />
        <Polje oznaka="Kontakt osoba" name="kontakt" defaultValue={p?.kontakt ?? ""} />
        <Polje oznaka="Telefon" name="telefon" defaultValue={p?.telefon ?? ""} />
      </div>
      {stanje && !stanje.ok && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          Spremi poslovnicu
        </Gumb>
      </div>
    </Obrazac>
  );
}

export function Poslovnice({ partnerId, poslovnice, smijeUredivati }: { partnerId: string; poslovnice: Poslovnica[]; smijeUredivati: boolean }) {
  const [uredi, setUredi] = useState<Poslovnica | "nova" | null>(null);
  const [, zapocni] = useTransition();
  const poruka = usePoruke();
  return (
    <div className="flex flex-col gap-3">
      {poslovnice.length === 0 && <p className="text-sm text-neutral-500">Nema poslovnica.</p>}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800" data-testid="poslovnice">
        {poslovnice.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="font-medium">
                {p.naziv} {!p.aktivan && <Znacka boja="crvena">deaktivirana</Znacka>}
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">
                {[p.adresa, [p.postanskiBroj, p.mjesto].filter(Boolean).join(" "), p.kontakt, p.telefon].filter(Boolean).join(" · ")}
              </div>
            </div>
            {smijeUredivati && (
              <div className="flex gap-2">
                <Gumb malen onClick={() => setUredi(p)}>
                  Uredi
                </Gumb>
                <Gumb
                  malen
                  onClick={() =>
                    zapocni(async () => {
                      const r = await aktivnostPoslovniceAkcija(partnerId, p.id, !p.aktivan);
                      poruka(r.ok ? (r.poruka ?? "") : r.greska, r.ok ? "uspjeh" : "greska");
                    })
                  }
                >
                  {p.aktivan ? "Deaktiviraj" : "Aktiviraj"}
                </Gumb>
              </div>
            )}
          </li>
        ))}
      </ul>
      {smijeUredivati && (
        <div>
          <Gumb onClick={() => setUredi("nova")}>Nova poslovnica</Gumb>
        </div>
      )}
      <Dijalog otvoren={uredi !== null} onZatvori={() => setUredi(null)} naslov={uredi === "nova" ? "Nova poslovnica" : "Poslovnica"}>
        {uredi !== null && (
          <ObrazacPoslovnice
            partnerId={partnerId}
            p={uredi === "nova" ? null : uredi}
            onGotovo={() => {
              setUredi(null);
              poruka("Poslovnica je spremljena.");
            }}
          />
        )}
      </Dijalog>
    </div>
  );
}
