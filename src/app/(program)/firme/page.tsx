import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { jeAdministrator } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { mojeFirme, mojiPozivi } from "@/services/firme";
import { NovaFirma, OdgovorNaPoziv, Prijedi } from "./obrasci";

export const metadata = { title: "Firme · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function Firme() {
  const k = await pristupStranici("/firme");
  const [firme, pozivi] = await Promise.all([mojeFirme(db, k.korisnikId), mojiPozivi(db, k.sesija.korisnik.email)]);
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="Firme"
        opis="Firme u kojima radite. Podaci svake firme su potpuno odvojeni; prava vrijede po firmi (uloga u svakoj firmi posebno)."
      />
      <Kartica naslov="Moje firme">
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800" data-testid="moje-firme">
          {firme.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">{f.naziv}</span>
                <span className="text-neutral-600 dark:text-neutral-400">OIB {f.oib}</span>
                <Znacka boja="plava">{f.uloga}</Znacka>
              </div>
              {f.id === k.firmaId ? <Znacka boja="zelena">trenutna</Znacka> : <Prijedi id={f.id} />}
            </li>
          ))}
        </ul>
      </Kartica>
      {pozivi.length > 0 && (
        <Kartica naslov="Pozivi u firme">
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800" data-testid="pozivi">
            {pozivi.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-medium">{p.firma}</span> — uloga {p.uloga}, poziv od: {p.pozvao}
                </span>
                <OdgovorNaPoziv id={p.id} />
              </li>
            ))}
          </ul>
        </Kartica>
      )}
      {jeAdministrator(k.prava) && (
        <Kartica naslov="Nova firma">
          <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
            Nova firma dobiva zadane uloge i šifrarnike; vi ste njen administrator. Ostale korisnike u nju pozivate na stranici Korisnici.
          </p>
          <NovaFirma />
        </Kartica>
      )}
    </Stranica>
  );
}
