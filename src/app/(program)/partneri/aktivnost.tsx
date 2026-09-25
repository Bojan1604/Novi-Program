"use client";

import { useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { usePoruke } from "@/components/ui/poruke";
import { aktivnostPartneraAkcija, obrisiPartneraAkcija, provjeriViesAkcija } from "./akcije";

export function AkcijePartnera({
  id,
  aktivan,
  smijeBrisati,
  imaPdvBroj,
}: {
  id: string;
  aktivan: boolean;
  smijeBrisati: boolean;
  imaPdvBroj: boolean;
}) {
  const [uTijeku, zapocni] = useTransition();
  const poruka = usePoruke();
  const javi = (r: { ok: true; poruka?: string } | { ok: false; greska: string } | undefined) =>
    r && poruka(r.ok ? (r.poruka ?? "") : r.greska, r.ok ? "uspjeh" : "greska");
  return (
    <div className="flex flex-wrap gap-2">
      {imaPdvBroj && (
        <Gumb disabled={uTijeku} onClick={() => zapocni(async () => javi(await provjeriViesAkcija(id)))}>
          Provjeri PDV broj (VIES)
        </Gumb>
      )}
      <Gumb disabled={uTijeku} onClick={() => zapocni(async () => javi(await aktivnostPartneraAkcija(id, !aktivan)))}>
        {aktivan ? "Deaktiviraj" : "Aktiviraj"}
      </Gumb>
      {smijeBrisati && (
        <Gumb
          varijanta="opasni"
          disabled={uTijeku}
          onClick={() => {
            if (confirm("Obrisati partnera? Moguće samo ako se nigdje ne koristi.")) zapocni(async () => javi(await obrisiPartneraAkcija(id)));
          }}
        >
          Obriši
        </Gumb>
      )}
    </div>
  );
}
