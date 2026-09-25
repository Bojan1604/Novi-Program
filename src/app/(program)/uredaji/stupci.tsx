"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dijalog } from "@/components/ui/dijalog";
import { Gumb } from "@/components/ui/gumb";
import { Kvacica } from "@/components/ui/polje";

/** Odabir stupaca popisa; pamti se u kolačiću pa poslužitelj odmah šalje prave stupce. */
export function OdabirStupaca({ svi, odabrani, kolacic }: { svi: { kljuc: string; naslov: string }[]; odabrani: string[]; kolacic: string }) {
  const [otvoren, setOtvoren] = useState(false);
  const [izbor, setIzbor] = useState(odabrani);
  const router = useRouter();
  const spremi = () => {
    document.cookie = `${kolacic}=${izbor.join(",")}; path=/; max-age=${400 * 24 * 3600}; samesite=lax`;
    setOtvoren(false);
    router.refresh();
  };
  return (
    <>
      <Gumb malen onClick={() => setOtvoren(true)}>
        Stupci
      </Gumb>
      <Dijalog otvoren={otvoren} onZatvori={() => setOtvoren(false)} naslov="Stupci">
        <div className="grid grid-cols-2 gap-x-4">
          {svi.map((s) => (
            <Kvacica
              key={s.kljuc}
              oznaka={s.naslov}
              checked={izbor.includes(s.kljuc)}
              onChange={(e) => setIzbor((x) => (e.target.checked ? [...x, s.kljuc] : x.filter((k) => k !== s.kljuc)))}
            />
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Gumb varijanta="primarni" onClick={spremi}>
            Primijeni
          </Gumb>
          <Gumb
            varijanta="tihi"
            onClick={() => {
              setIzbor([]);
              document.cookie = `${kolacic}=; path=/; max-age=0`;
              setOtvoren(false);
              router.refresh();
            }}
          >
            Zadani stupci
          </Gumb>
        </div>
      </Dijalog>
    </>
  );
}
