"use client";

import { useState } from "react";
import { Dijalog } from "@/components/ui/dijalog";
import { Gumb } from "@/components/ui/gumb";
import { usePoruke } from "@/components/ui/poruke";
import { Pretrazivac } from "@/components/ui/pretrazivac";
import type { Stavka } from "@/components/ui/pretrazivac-stanje";

export function DemoKomponente() {
  const [odabrano, setOdabrano] = useState<Stavka | null>(null);
  const [uDijalogu, setUDijalogu] = useState<Stavka | null>(null);
  const [otvoren, setOtvoren] = useState(false);
  const [poslano, setPoslano] = useState<string | null>(null);
  const poruka = usePoruke();

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPoslano(String(new FormData(e.currentTarget).get("partnerId")));
        }}
        className="flex max-w-md flex-col gap-3"
      >
        <Pretrazivac izvor="/api/razvoj/pretraga" name="partnerId" oznaka="Partner" onPromjena={setOdabrano} />
        <output data-testid="odabrano">{odabrano ? odabrano.naziv : "—"}</output>
        <div>
          <Gumb type="submit">Pošalji obrazac</Gumb>
        </div>
        <output data-testid="poslano">{poslano ?? ""}</output>
      </form>

      <div className="flex flex-wrap gap-2">
        <Gumb onClick={() => setOtvoren(true)}>Otvori dijalog</Gumb>
        <Gumb onClick={() => poruka("Spremljeno.")}>Pokaži poruku</Gumb>
        <Gumb onClick={() => poruka("Nešto nije u redu.", "greska")}>Pokaži grešku</Gumb>
      </div>
      <output data-testid="u-dijalogu">{uDijalogu ? uDijalogu.naziv : "—"}</output>

      <Dijalog otvoren={otvoren} onZatvori={() => setOtvoren(false)} naslov="Odabir partnera">
        <div className="flex flex-col gap-3">
          <Pretrazivac izvor="/api/razvoj/pretraga" oznaka="Partner u dijalogu" onPromjena={setUDijalogu} />
          <Gumb varijanta="primarni" onClick={() => setOtvoren(false)}>
            Gotovo
          </Gumb>
        </div>
      </Dijalog>
    </div>
  );
}
