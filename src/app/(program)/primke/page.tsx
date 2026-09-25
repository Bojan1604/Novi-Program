import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { GumbiIzvoza } from "@/components/ui/izvoz";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { formatirajIznos } from "@/domain/novac";
import { jedan, sortiranje, stranica, velicina, vise } from "@/domain/popis";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { popisPrimki } from "@/queries/primke";

export const metadata = { title: "Primke · ERP-WMS" };

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function Primke({ searchParams }: PageProps<"/primke">) {
  const k = await pristupStranici("/primke");
  const sp = await searchParams;
  const vidiNabavne = imaPosebno(k.prava, "costs");
  const f = {
    trazi: jedan(sp["trazi"]),
    status: vise(sp["status"]),
    sort: sortiranje(sp, ["datum", "broj"] as const, { kljuc: "datum", smjer: "desc" }),
    stranica: stranica(sp["stranica"]),
    velicina: velicina(sp["velicina"]),
  };
  const r = await popisPrimki(k.db, k.firmaId, f, vidiNabavne);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));

  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Primke"
        opis="Zaprimanje uređaja na skladište"
        akcije={
          <>
            <GumbiIzvoza izvor="primke" parametri={sp} />
            {imaPravo(k.prava, "uredaji", "operativno") && (
              <GumbVeza href="/primke/nova" varijanta="primarni">
                Nova primka
              </GumbVeza>
            )}
          </>
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Broj, dobavljač, dokument, serijski" />
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={[
              { vrijednost: "IZDANA", naziv: "Izdane" },
              { vrijednost: "STORNIRANA", naziv: "Stornirane" },
            ]}
          />
        </div>
        <Tablica
          testId="popis-primki"
          putanja="/primke"
          parametri={sp}
          sort={f.sort}
          redovi={r.redovi}
          kljucReda={(p) => p.id}
          veza={(p) => `/primke/${p.id}`}
          stupci={[
            { kljuc: "broj", naslov: "Broj", sortira: "broj", prikaz: (p) => p.broj },
            { kljuc: "datum", naslov: "Datum", sortira: "datum", prikaz: (p) => datum.format(p.datum) },
            { kljuc: "dobavljac", naslov: "Dobavljač", prikaz: (p) => p.dobavljac?.naziv ?? "" },
            { kljuc: "skladiste", naslov: "Skladište", prikaz: (p) => p.skladiste.naziv },
            { kljuc: "uredaja", naslov: "Uređaja", desno: true, prikaz: (p) => p.brojUredaja.toLocaleString("hr-HR") },
            ...(vidiNabavne
              ? [
                  {
                    kljuc: "nabavno",
                    naslov: "Nabavna vrijednost",
                    desno: true,
                    prikaz: (p: (typeof r.redovi)[number]) => (p.nabavnaVrijednost === null ? "" : `${formatirajIznos(p.nabavnaVrijednost)} €`),
                  },
                ]
              : []),
            { kljuc: "status", naslov: "Status", prikaz: (p) => (p.status === "STORNIRANA" ? <Znacka boja="crvena">stornirana</Znacka> : "") },
          ]}
          podnozje={[
            "Ukupno (bez storniranih)",
            "",
            "",
            "",
            r.zbrojUredaja.toLocaleString("hr-HR"),
            ...(vidiNabavne ? [r.zbrojNabavno === null ? "" : `${formatirajIznos(r.zbrojNabavno)} €`] : []),
            "",
          ]}
        />
        <div className="mt-3">
          <Stranicenje putanja="/primke" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={r.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
