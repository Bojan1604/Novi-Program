import Link from "next/link";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { popisClanova, popisUloga } from "@/queries/korisnici";
import { DodajKorisnika } from "./obrasci";

export const metadata = { title: "Korisnici · ERP-WMS" };

const datumVrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

export default async function Korisnici() {
  const k = await pristupStranici("/korisnici");
  const [clanovi, uloge] = await Promise.all([popisClanova(k.db, k.firmaId), popisUloga(k.db, k.firmaId)]);
  const smijeDodati = imaPravo(k.prava, "korisnici", "puno");

  return (
    <Stranica>
      <NaslovStranice naslov="Korisnici" opis={`${clanovi.length} korisnika u firmi`} />
      <Kartica>
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800" data-testid="popis-korisnika">
          {clanovi.map((c) => (
            <li key={c.korisnikId}>
              <Link href={`/korisnici/${c.korisnikId}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-neutral-50 sm:px-2 dark:hover:bg-neutral-900">
                <div className="min-w-0">
                  <div className="font-medium">{c.ime}</div>
                  <div className="truncate text-sm text-neutral-600 dark:text-neutral-400">{c.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Znacka boja="plava">{c.uloga.naziv}</Znacka>
                  {c.imaIznimke && <Znacka boja="zuta">iznimke</Znacka>}
                  {!c.aktivan && <Znacka boja="crvena">isključen</Znacka>}
                  <span className="text-xs text-neutral-500">{c.zadnjaPrijava ? `prijava ${datumVrijeme.format(c.zadnjaPrijava)}` : "nije se prijavljivao"}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Kartica>
      {smijeDodati && (
        <Kartica naslov="Novi korisnik">
          <DodajKorisnika uloge={uloge.map(({ id, naziv }) => ({ id, naziv }))} />
        </Kartica>
      )}
    </Stranica>
  );
}
