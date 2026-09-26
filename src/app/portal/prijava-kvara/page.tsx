import { Kartica, NaslovStranice } from "@/components/ui/stranica";
import { jedan } from "@/domain/popis";
import { db } from "@/lib/db";
import { pristupPortalu } from "@/lib/portal";
import { uredajiZaPrijavu } from "@/queries/portal";
import { PrijavaKvara } from "./obrazac";

export const metadata = { title: "Prijava kvara · Portal klijenata" };
export const dynamic = "force-dynamic";

export default async function PrijavaKvaraStranica({ searchParams }: PageProps<"/portal/prijava-kvara">) {
  const k = await pristupPortalu();
  const sp = await searchParams;
  const uredaji = await uredajiZaPrijavu(db, k);
  const odabran = jedan(sp["uredaj"]) ?? "";
  return (
    <>
      <NaslovStranice naslov="Prijava kvara" opis="Javit ćemo vam se kad preuzmemo uređaj; tijek servisa pratite ovdje na portalu." />
      <Kartica>
        {uredaji.length === 0 ? (
          <p className="text-sm text-neutral-500">Nema uređaja za koje se može prijaviti kvar (ili su već na servisu).</p>
        ) : (
          <PrijavaKvara
            uredaji={uredaji.map((u) => ({ id: u.id, naziv: `${u.serijski} · ${u.model.naziv}` }))}
            odabran={uredaji.some((u) => u.id === odabran) ? odabran : ""}
          />
        )}
      </Kartica>
    </>
  );
}
