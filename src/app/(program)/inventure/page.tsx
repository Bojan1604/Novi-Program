import { FilterVise } from "@/components/ui/filtri";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { danas } from "@/domain/datum";
import { stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { popisInventura } from "@/queries/inventure";
import { NovaInventura } from "./obrasci";

export const metadata = { title: "Inventure · ERP-WMS" };

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function Inventure({ searchParams }: PageProps<"/inventure">) {
  const k = await pristupStranici("/inventure");
  const sp = await searchParams;
  const f = { status: vise(sp["status"]), stranica: stranica(sp["stranica"]), velicina: velicina(sp["velicina"]) };
  const [r, skladista] = await Promise.all([
    popisInventura(k.db, k.firmaId, f),
    k.db.skladiste.findMany({
      where: { firmaId: k.firmaId, aktivan: true },
      orderBy: [{ zadano: "desc" }, { naziv: "asc" }],
      select: { id: true, naziv: true },
    }),
  ]);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Inventure" opis="Skenirajte što je stvarno na polici — program pokaže manjak i višak" />
      {imaPravo(k.prava, "uredaji", "operativno") && skladista.length > 0 && (
        <Kartica naslov="Nova inventura">
          <NovaInventura skladista={skladista} danas={danas()} />
        </Kartica>
      )}
      <Kartica>
        <div className="mb-3">
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={[
              { vrijednost: "OTVORENA", naziv: "Otvorene" },
              { vrijednost: "ZAKLJUCENA", naziv: "Zaključene" },
            ]}
          />
        </div>
        <Tablica
          testId="popis-inventura"
          putanja="/inventure"
          parametri={sp}
          redovi={r.redovi}
          kljucReda={(i) => i.id}
          veza={(i) => `/inventure/${i.id}`}
          stupci={[
            { kljuc: "broj", naslov: "Broj", prikaz: (i) => i.broj },
            { kljuc: "datum", naslov: "Datum", prikaz: (i) => datum.format(i.datum) },
            { kljuc: "skladiste", naslov: "Skladište", prikaz: (i) => i.skladiste.naziv },
            { kljuc: "status", naslov: "Status", prikaz: (i) => (i.status === "OTVORENA" ? <Znacka boja="plava">otvorena</Znacka> : "zaključena") },
            {
              kljuc: "rezultat",
              naslov: "Rezultat",
              prikaz: (i) =>
                i.status === "ZAKLJUCENA"
                  ? `pronađeno ${i.pronadjeno}/${i.ocekivano} · manjak ${i.manjak} · višak ${i.visak}`
                  : `skenirano ${i._count.stavke}`,
            },
            { kljuc: "korisnik", naslov: "Vodi", prikaz: (i) => i.korisnik },
          ]}
        />
        <div className="mt-3">
          <Stranicenje putanja="/inventure" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={r.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
