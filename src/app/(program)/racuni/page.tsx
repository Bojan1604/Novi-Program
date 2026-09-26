import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { formatirajIznos } from "@/domain/novac";
import { jedan, sortiranje, stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { popisProdaje } from "@/queries/prodaja";

export const metadata = { title: "Računi · ERP-WMS" };

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const VRSTE = ["RACUN"];

export default async function Racuni({ searchParams }: PageProps<"/racuni">) {
  const k = await pristupStranici("/racuni");
  const sp = await searchParams;
  const f = {
    vrsta: vise(sp["vrsta"]),
    trazi: jedan(sp["trazi"]),
    status: vise(sp["status"]),
    partnerId: jedan(sp["partner"]),
    sort: sortiranje(sp, ["datum", "broj", "ukupno"] as const, { kljuc: "datum", smjer: "desc" }),
    stranica: stranica(sp["stranica"]),
    velicina: velicina(sp["velicina"]),
  };
  const r = await popisProdaje(k.db, k.firmaId, f, VRSTE);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  const smije = imaPravo(k.prava, "prodaja", "operativno");
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Računi"
        akcije={
          smije && (
            <GumbVeza href="/racuni/nova" varijanta="primarni">
              Novi račun
            </GumbVeza>
          )
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Broj, kupac, napomena, serijski" />
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={[
              { vrijednost: "NACRT", naziv: "Nacrti" },
              { vrijednost: "IZDAN", naziv: "Izdani" },
              { vrijednost: "STORNIRAN", naziv: "Stornirani" },
            ]}
          />
        </div>
        <Tablica
          testId="popis-racuna"
          putanja="/racuni"
          parametri={sp}
          sort={f.sort}
          redovi={r.redovi}
          kljucReda={(d) => d.id}
          veza={(d) => `/racuni/${d.id}`}
          stupci={[
            { kljuc: "broj", naslov: "Broj", sortira: "broj", prikaz: (d) => d.broj ?? <Znacka>nacrt</Znacka> },
            { kljuc: "dospijece", naslov: "Dospijeće", prikaz: (d) => (d.dospijece ? datum.format(d.dospijece) : "") },
            { kljuc: "datum", naslov: "Datum", sortira: "datum", prikaz: (d) => datum.format(d.datum) },
            { kljuc: "kupac", naslov: "Kupac", prikaz: (d) => d.partner?.naziv ?? "" },
            { kljuc: "osnovica", naslov: "Osnovica", desno: true, prikaz: (d) => `${formatirajIznos(d.osnovica)} €` },
            { kljuc: "ukupno", naslov: "Ukupno", desno: true, sortira: "ukupno", prikaz: (d) => `${formatirajIznos(d.ukupno)} €` },
            { kljuc: "korisnik", naslov: "Izradio", prikaz: (d) => d.korisnik },
          ]}
          podnozje={["Izdano ukupno", "", "", "", `${formatirajIznos(r.zbrojOsnovica)} €`, `${formatirajIznos(r.zbrojUkupno)} €`, ""]}
        />
        <div className="mt-3">
          <Stranicenje putanja="/racuni" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={r.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
