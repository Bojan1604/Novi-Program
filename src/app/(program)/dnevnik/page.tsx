import { Promjene } from "@/components/ui/promjene";
import { klaseGumba } from "@/components/ui/gumb";
import { GumbiIzvoza } from "@/components/ui/izvoz";
import { klaseUnosa } from "@/components/ui/polje";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { imaPosebno } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { jedan, stranica as procitajStranicu } from "@/domain/popis";
import { filtriDnevnika, stranicaDnevnika } from "@/queries/dnevnik";

export const metadata = { title: "Dnevnik promjena · ERP-WMS" };

const vrijemeFormat = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Zagreb" });

export default async function Dnevnik({ searchParams }: PageProps<"/dnevnik">) {
  const k = await pristupStranici("/dnevnik");
  const sp = await searchParams;
  const f = {
    stranica: procitajStranicu(sp["stranica"]),
    korisnikId: jedan(sp["korisnik"]),
    entitet: jedan(sp["entitet"]),
    entitetId: jedan(sp["id"]),
    od: jedan(sp["od"]),
    do: jedan(sp["do"]),
    trazi: jedan(sp["trazi"]),
  };
  const [rezultat, filtri] = await Promise.all([stranicaDnevnika(k.db, k.firmaId, f, imaPosebno(k.prava, "costs")), filtriDnevnika(k.db, k.firmaId)]);

  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Dnevnik promjena"
        opis="Tko je što promijenio i kada."
        akcije={
          <GumbiIzvoza
            izvor="dnevnik"
            parametri={{ korisnik: f.korisnikId, entitet: f.entitet, id: f.entitetId, od: f.od, do: f.do, trazi: f.trazi }}
          />
        }
      />
      <Kartica>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
          <label className="flex flex-col gap-1 text-sm lg:col-span-2">
            <span className="font-medium">Traži</span>
            <input name="trazi" defaultValue={f.trazi ?? ""} placeholder="opis, ime, vrijednost…" className={klaseUnosa} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Korisnik</span>
            <select name="korisnik" defaultValue={f.korisnikId ?? ""} className={klaseUnosa}>
              <option value="">Svi</option>
              {filtri.korisnici.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.ime}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Vrsta</span>
            <select name="entitet" defaultValue={f.entitet ?? ""} className={klaseUnosa}>
              <option value="">Sve</option>
              {filtri.entiteti.map((x) => (
                <option key={x.vrijednost} value={x.vrijednost}>
                  {x.naziv}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Od</span>
            <input type="date" name="od" defaultValue={f.od ?? ""} className={klaseUnosa} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Do</span>
            <input type="date" name="do" defaultValue={f.do ?? ""} className={klaseUnosa} />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
            <button type="submit" className={klaseGumba("primarni")}>
              Primijeni
            </button>
            <a href="/dnevnik" className={klaseGumba("tihi")}>
              Očisti
            </a>
          </div>
        </form>
      </Kartica>
      <Kartica>
        <Stranicenje
          putanja="/dnevnik"
          parametri={{ ...f, korisnik: f.korisnikId, id: f.entitetId, korisnikId: undefined, entitetId: undefined, stranica: undefined }}
          stranica={rezultat.stranica}
          velicina={rezultat.velicina}
          ukupno={rezultat.ukupno}
        />
        <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800" data-testid="dnevnik">
          {rezultat.zapisi.map((z) => (
            <li key={z.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="min-w-0 font-medium">{z.opis}</div>
                <div className="text-xs text-neutral-500">
                  {vrijemeFormat.format(z.vrijeme)} · {z.korisnik}
                </div>
              </div>
              <Promjene promjene={z.promjene} />
            </li>
          ))}
          {rezultat.zapisi.length === 0 && <li className="py-6 text-center text-sm text-neutral-500">Nema zapisa.</li>}
        </ul>
      </Kartica>
    </Stranica>
  );
}
