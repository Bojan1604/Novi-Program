import { GumbiIzvoza } from "@/components/ui/izvoz";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Tablica } from "@/components/ui/tablica";
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
    </Stranica>
  );
}
