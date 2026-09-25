import Link from "next/link";
import { NaslovStranice, Stranica } from "@/components/ui/stranica";
import { pristupStranici } from "@/lib/akcija";
import { SIFRARNICI } from "@/lib/sifrarnici";
import { brojeviSifrarnika } from "@/queries/sifrarnici";

export const metadata = { title: "Šifrarnici · ERP-WMS" };

export default async function Sifrarnici() {
  const k = await pristupStranici("/sifrarnici");
  const brojevi = await brojeviSifrarnika(k.db, k.firmaId);
  return (
    <Stranica>
      <NaslovStranice naslov="Šifrarnici" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SIFRARNICI.map((d) => (
          <Link
            key={d.kljuc}
            href={`/sifrarnici/${d.kljuc}`}
            className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-primarna dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{d.naslov}</span>
              <span className="text-sm text-neutral-500">{brojevi[d.kljuc] ?? 0}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{d.opis}</p>
          </Link>
        ))}
      </div>
    </Stranica>
  );
}
