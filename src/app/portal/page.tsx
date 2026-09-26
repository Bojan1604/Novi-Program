import Link from "next/link";
import { PoljePretrage } from "@/components/ui/filtri";
import { Kartica, NaslovStranice, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { danas } from "@/domain/datum";
import { jedan, stranica, velicina } from "@/domain/popis";
import { db } from "@/lib/db";
import { pristupPortalu } from "@/lib/portal";
import { STANJA_ZA_KLIJENTA, uredajiKlijenta } from "@/queries/portal";
import { Jamstvo } from "./jamstvo";

export const metadata = { title: "Uređaji · Portal klijenata" };
export const dynamic = "force-dynamic";

export default async function PortalUredaji({ searchParams }: PageProps<"/portal">) {
  const k = await pristupPortalu();
  const sp = await searchParams;
  const str = stranica(sp["stranica"]);
  const vel = velicina(sp["velicina"]);
  const { ukupno, redovi } = await uredajiKlijenta(db, k, { trazi: jedan(sp["trazi"])?.trim(), stranica: str, velicina: vel });
  const dan = danas();
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  return (
    <>
      <NaslovStranice naslov="Vaši uređaji" opis={`Ukupno: ${ukupno}`} />
      <Kartica>
        <div className="mb-3">
          <PoljePretrage placeholder="Serijski broj" />
        </div>
        {redovi.length === 0 ? (
          <p className="text-sm text-neutral-500">Nema uređaja.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="uredaji-klijenta">
            {redovi.map((u) => (
              <li key={u.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/portal/uredaji/${u.id}`} className="font-medium break-all text-primarna-slova hover:underline">
                    {u.serijski}
                  </Link>
                  <div className="text-sm text-neutral-600 dark:text-neutral-400">
                    {u.model.proizvodjac.naziv} {u.model.naziv}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Znacka boja={u.stanje === "NA_SERVISU" ? "zuta" : "plava"}>{STANJA_ZA_KLIJENTA[u.stanje] ?? u.stanje}</Znacka>
                  <Jamstvo jamstvoDo={u.jamstvoDo} dan={dan} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Stranicenje putanja="/portal" parametri={ravni} stranica={str} velicina={vel} ukupno={ukupno} />
        </div>
      </Kartica>
    </>
  );
}
