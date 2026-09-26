import Link from "next/link";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { pristupStranici } from "@/lib/akcija";
import { IZVJESTAJI } from "@/lib/izvjestaji";
import { smijeIzvjestaj } from "@/lib/izvjestaji/izvrsi";

export const metadata = { title: "Izvještaji · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function Izvjestaji() {
  const k = await pristupStranici("/izvjestaji");
  const dopusteni = IZVJESTAJI.filter((iz) => smijeIzvjestaj(k.prava, iz));
  const grupe = [...new Set(dopusteni.map((x) => x.grupa))];
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Izvještaji" opis="Svi zbrojevi dolaze iz baze za cijeli odabrani skup; izvoz ima iste filtre." />
      {grupe.map((g) => (
        <Kartica key={g} naslov={g}>
          <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid={`izvjestaji-${g}`}>
            {dopusteni
              .filter((x) => x.grupa === g)
              .map((x) => (
                <li key={x.kljuc} className="py-2">
                  <Link href={`/izvjestaji/${x.kljuc}`} className="font-medium text-primarna hover:underline">
                    {x.naziv}
                  </Link>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{x.opis}</p>
                </li>
              ))}
          </ul>
        </Kartica>
      ))}
      {dopusteni.length === 0 && <p className="text-sm text-neutral-500">Nemate prava ni na jedan izvještaj.</p>}
    </Stranica>
  );
}
