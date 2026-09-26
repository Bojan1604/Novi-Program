import { FilterRazdoblja, FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { GumbiIzvoza } from "@/components/ui/izvoz";
import { Tablica } from "@/components/ui/tablica";
import { formatirajIznos } from "@/domain/novac";
import { jedan, sortiranje, stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { VRSTE_PRODAJE, type VrstaProdaje } from "@/domain/prodaja";
import { pristupStranici } from "@/lib/akcija";
import { popisProdaje } from "@/queries/prodaja";

export const metadata = { title: "Ponude i predračuni · ERP-WMS" };

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const VRSTE = ["PONUDA", "PREDRACUN"];

export default async function Ponude({ searchParams }: PageProps<"/ponude">) {
  const k = await pristupStranici("/ponude");
  const sp = await searchParams;
  const f = {
    vrsta: vise(sp["vrsta"]),
    trazi: jedan(sp["trazi"]),
    status: vise(sp["status"]),
    partnerId: jedan(sp["partner"]),
    od: jedan(sp["od"]),
    do: jedan(sp["do"]),
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
        naslov="Ponude i predračuni"
        akcije={
          smije && (
            <>
              <GumbVeza href="/ponude/nova?vrsta=PONUDA" varijanta="primarni">
                Nova ponuda
              </GumbVeza>
              <GumbVeza href="/ponude/nova?vrsta=PREDRACUN">Novi predračun</GumbVeza>
            </>
          )
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Broj, kupac, napomena, serijski" />
          <FilterRazdoblja />
          <FilterVise
            oznaka="Vrsta"
            parametar="vrsta"
            opcije={VRSTE.map((v) => ({ vrijednost: v, naziv: VRSTE_PRODAJE[v as VrstaProdaje].naziv }))}
          />
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={[
              { vrijednost: "NACRT", naziv: "Nacrti" },
              { vrijednost: "IZDAN", naziv: "Izdani" },
            ]}
          />
        </div>
        <Tablica
          testId="popis-ponuda"
          putanja="/ponude"
          parametri={sp}
          sort={f.sort}
          redovi={r.redovi}
          kljucReda={(d) => d.id}
          veza={(d) => `/ponude/${d.id}`}
          stupci={[
            { kljuc: "broj", naslov: "Broj", sortira: "broj", prikaz: (d) => d.broj ?? <Znacka>nacrt</Znacka> },
            { kljuc: "vrsta", naslov: "Vrsta", prikaz: (d) => VRSTE_PRODAJE[d.vrsta as VrstaProdaje]?.naziv ?? d.vrsta },
            { kljuc: "datum", naslov: "Datum", sortira: "datum", prikaz: (d) => datum.format(d.datum) },
            { kljuc: "kupac", naslov: "Kupac", prikaz: (d) => d.partner?.naziv ?? "" },
            { kljuc: "osnovica", naslov: "Osnovica", desno: true, prikaz: (d) => `${formatirajIznos(d.osnovica)} €` },
            { kljuc: "ukupno", naslov: "Ukupno", desno: true, sortira: "ukupno", prikaz: (d) => `${formatirajIznos(d.ukupno)} €` },
            { kljuc: "korisnik", naslov: "Izradio", prikaz: (d) => d.korisnik },
          ]}
          podnozje={["Izdano ukupno", "", "", "", `${formatirajIznos(r.zbrojOsnovica)} €`, `${formatirajIznos(r.zbrojUkupno)} €`, ""]}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <GumbiIzvoza izvor="ponude" parametri={sp} />
          <Stranicenje putanja="/ponude" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={r.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
