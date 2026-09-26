import Link from "next/link";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { stranica, velicina } from "@/domain/popis";
import { STATUSI_SERVISA, type StatusServisa } from "@/domain/servis";
import { db } from "@/lib/db";
import { pristupPortalu } from "@/lib/portal";
import { naloziKlijenta } from "@/queries/portal";

export const metadata = { title: "Servis · Portal klijenata" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function PortalNalozi({ searchParams }: PageProps<"/portal/nalozi">) {
  const k = await pristupPortalu();
  const sp = await searchParams;
  const str = stranica(sp["stranica"]);
  const vel = velicina(sp["velicina"]);
  const { ukupno, redovi } = await naloziKlijenta(db, k, { stranica: str, velicina: vel });
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  return (
    <>
      <NaslovStranice
        naslov="Servisni nalozi"
        akcije={
          <GumbVeza href="/portal/prijava-kvara" varijanta="primarni">
            Prijava kvara
          </GumbVeza>
        }
      />
      <Kartica>
        {redovi.length === 0 ? (
          <p className="text-sm text-neutral-500">Nema servisnih naloga.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="nalozi-klijenta">
            {redovi.map((n) => (
              <li key={n.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/portal/nalozi/${n.id}`} className="font-medium text-primarna-slova hover:underline">
                    {n.broj}
                  </Link>{" "}
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    · {n.uredaj.serijski} · {datum.format(n.datum)}
                  </span>
                  <div className="line-clamp-1 text-sm break-words text-neutral-500">{n.opisKvara}</div>
                </div>
                <Znacka>{STATUSI_SERVISA[n.status as StatusServisa]}</Znacka>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Stranicenje putanja="/portal/nalozi" parametri={ravni} stranica={str} velicina={vel} ukupno={ukupno} />
        </div>
      </Kartica>
    </>
  );
}
