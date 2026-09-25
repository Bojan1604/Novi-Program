"use client";

import { useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { usePoruke } from "@/components/ui/poruke";
import { stornirajPrimkuAkcija } from "./akcije";

export function StornoPrimke({ id }: { id: string }) {
  const [uTijeku, zapocni] = useTransition();
  const poruka = usePoruke();
  return (
    <Gumb
      varijanta="opasni"
      disabled={uTijeku}
      onClick={() => {
        if (!confirm("Stornirati primku? Uređaji s nje bit će uklonjeni iz programa.")) return;
        zapocni(async () => {
          const r = await stornirajPrimkuAkcija(id);
          poruka(r.ok ? (r.poruka ?? "") : r.greska, r.ok ? "uspjeh" : "greska");
        });
      }}
    >
      Storniraj primku
    </Gumb>
  );
}
