import { GumbiIzvoza } from "@/components/ui/izvoz";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Tablica } from "@/components/ui/tablica";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { popisClanova, popisUloga } from "@/queries/korisnici";
import { DodajKorisnika, OtkaziPoziv, PozoviKorisnika } from "./obrasci";

export const metadata = { title: "Korisnici · ERP-WMS" };

const datumVrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

export default async function Korisnici() {
  const k = await pristupStranici("/korisnici");
  const smijeDodati = imaPravo(k.prava, "korisnici", "puno");
  const [clanovi, uloge, pozivi] = await Promise.all([
    popisClanova(k.db, k.firmaId),
    popisUloga(k.db, k.firmaId),
    smijeDodati
      ? k.db.pozivUFirmu.findMany({ where: { firmaId: k.firmaId }, orderBy: { stvoreno: "desc" }, include: { uloga: { select: { naziv: true } } } })
      : [],
  ]);

  return (
    <Stranica>
      <NaslovStranice naslov="Korisnici" opis={`${clanovi.length} korisnika u firmi`} />
      <Kartica>
        <div className="mb-3 flex justify-end">
          <GumbiIzvoza izvor="korisnici" parametri={{}} />
        </div>
        <Tablica
          testId="popis-korisnika"
          putanja="/korisnici"
          parametri={{}}
          redovi={clanovi}
          kljucReda={(c) => c.korisnikId}
          veza={(c) => `/korisnici/${c.korisnikId}`}
          stupci={[
            { kljuc: "ime", naslov: "Ime", prikaz: (c) => c.ime },
            { kljuc: "email", naslov: "E-pošta", prikaz: (c) => c.email },
            {
              kljuc: "uloga",
              naslov: "Uloga",
              prikaz: (c) => (
                <span className="inline-flex flex-wrap gap-1">
                  <Znacka boja="plava">{c.uloga.naziv}</Znacka>
                  {c.imaIznimke && <Znacka boja="zuta">iznimke</Znacka>}
                  {!c.aktivan && <Znacka boja="crvena">isključen</Znacka>}
                </span>
              ),
            },
            { kljuc: "prijava", naslov: "Zadnja prijava", prikaz: (c) => (c.zadnjaPrijava ? datumVrijeme.format(c.zadnjaPrijava) : "—") },
          ]}
        />
      </Kartica>
      {smijeDodati && (
        <Kartica naslov="Novi korisnik">
          <DodajKorisnika uloge={uloge.map(({ id, naziv }) => ({ id, naziv }))} />
        </Kartica>
      )}
      {smijeDodati && (
        <Kartica naslov="Poziv osobi koja već ima račun">
          <PozoviKorisnika uloge={uloge.map(({ id, naziv }) => ({ id, naziv }))} />
          {pozivi.length > 0 && (
            <ul
              className="mt-3 divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800"
              data-testid="pozivi-firme"
            >
              {pozivi.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 break-all">
                    {p.email} — {p.uloga.naziv} <span className="text-neutral-500">(čeka prihvaćanje)</span>
                  </span>
                  <OtkaziPoziv id={p.id} />
                </li>
              ))}
            </ul>
          )}
        </Kartica>
      )}
    </Stranica>
  );
}
