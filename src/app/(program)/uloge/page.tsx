import Link from "next/link";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { popisUloga } from "@/queries/korisnici";

export const metadata = { title: "Uloge i prava · ERP-WMS" };

export default async function Uloge() {
  const k = await pristupStranici("/uloge");
  const uloge = await popisUloga(k.db, k.firmaId);
  return (
    <Stranica>
      <NaslovStranice
        naslov="Uloge i prava"
        opis="Uloga određuje što korisnik smije u svakom modulu. Pojedinom korisniku mogu se dati iznimke."
        akcije={
          imaPravo(k.prava, "korisnici", "puno") && (
            <GumbVeza href="/uloge/nova" varijanta="primarni">
              Nova uloga
            </GumbVeza>
          )
        }
      />
      <Kartica>
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {uloge.map((u) => (
            <li key={u.id}>
              <Link
                href={`/uloge/${u.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-neutral-50 sm:px-2 dark:hover:bg-neutral-900"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {u.naziv} {u.sustavna && <Znacka>sustavna</Znacka>}
                  </div>
                  <div className="text-sm text-neutral-600 dark:text-neutral-400">{u.opis}</div>
                </div>
                <span className="text-sm text-neutral-500">{u.brojKorisnika} korisnika</span>
              </Link>
            </li>
          ))}
        </ul>
      </Kartica>
    </Stranica>
  );
}
