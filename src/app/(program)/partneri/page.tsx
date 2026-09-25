import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { GumbiIzvoza } from "@/components/ui/izvoz";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { nazivDrzave } from "@/domain/drzave";
import { jedan, sortiranje, stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { popisPartnera } from "@/queries/partneri";

export const metadata = { title: "Partneri · ERP-WMS" };

export default async function Partneri({ searchParams }: PageProps<"/partneri">) {
  const k = await pristupStranici("/partneri");
  const sp = await searchParams;
  const f = {
    trazi: jedan(sp["trazi"]),
    vrsta: vise(sp["vrsta"]),
    aktivnost: vise(sp["aktivnost"]).length ? vise(sp["aktivnost"]) : ["aktivni"],
    sort: sortiranje(sp, ["naziv", "mjesto", "stvoreno"] as const, { kljuc: "naziv", smjer: "asc" }),
    stranica: stranica(sp["stranica"]),
    velicina: velicina(sp["velicina"]),
  };
  const { ukupno, redovi } = await popisPartnera(k.db, k.firmaId, f);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));

  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Partneri"
        opis="Kupci i dobavljači"
        akcije={
          <>
            <GumbiIzvoza izvor="partneri" parametri={sp} />
            {imaPravo(k.prava, "partneri", "operativno") && (
              <GumbVeza href="/partneri/novi" varijanta="primarni">
                Novi partner
              </GumbVeza>
            )}
          </>
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Naziv, OIB, PDV broj, mjesto" />
          <FilterVise
            oznaka="Vrsta"
            parametar="vrsta"
            opcije={[
              { vrijednost: "kupci", naziv: "Kupci" },
              { vrijednost: "dobavljaci", naziv: "Dobavljači" },
            ]}
          />
          <FilterVise
            oznaka="Prikaz"
            parametar="aktivnost"
            opcije={[
              { vrijednost: "aktivni", naziv: "Aktivni" },
              { vrijednost: "neaktivni", naziv: "Deaktivirani" },
            ]}
          />
        </div>
        <Tablica
          testId="popis-partnera"
          putanja="/partneri"
          parametri={sp}
          sort={f.sort}
          redovi={redovi}
          kljucReda={(r) => r.id}
          veza={(r) => `/partneri/${r.id}`}
          stupci={[
            { kljuc: "naziv", naslov: "Naziv", sortira: "naziv", prikaz: (r) => r.naziv },
            { kljuc: "oib", naslov: "OIB / PDV broj", prikaz: (r) => r.oib ?? r.pdvBroj ?? "" },
            {
              kljuc: "mjesto",
              naslov: "Mjesto",
              sortira: "mjesto",
              prikaz: (r) => [r.mjesto, r.drzava !== "HR" ? nazivDrzave(r.drzava) : null].filter(Boolean).join(", "),
            },
            {
              kljuc: "vrsta",
              naslov: "Vrsta",
              prikaz: (r) => (
                <span className="inline-flex flex-wrap gap-1">
                  {r.kupac && <Znacka boja="plava">kupac</Znacka>}
                  {r.dobavljac && <Znacka boja="zuta">dobavljač</Znacka>}
                  {!r.aktivan && <Znacka boja="crvena">deaktiviran</Znacka>}
                </span>
              ),
            },
            { kljuc: "eracun", naslov: "eRačun", prikaz: (r) => (r.eRacunAdresa ? (r.eRacunAktivan === false ? "nije u sustavu" : "da") : "") },
          ]}
        />
        <div className="mt-3">
          <Stranicenje putanja="/partneri" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
