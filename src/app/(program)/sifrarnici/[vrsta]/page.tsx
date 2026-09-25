import { notFound } from "next/navigation";
import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { jedan, sortiranje, stranica, velicina, vise } from "@/domain/popis";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { definicija } from "@/lib/sifrarnici";
import { popisSifrarnika, vidljivaPolja } from "@/queries/sifrarnici";

export default async function PopisSifrarnika({ params, searchParams }: PageProps<"/sifrarnici/[vrsta]">) {
  const { vrsta } = await params;
  const def = definicija(vrsta);
  if (!def) notFound();
  const k = await pristupStranici("/sifrarnici");
  const sp = await searchParams;
  const vidiNabavne = imaPosebno(k.prava, "costs");
  const f = {
    trazi: jedan(sp["trazi"]),
    aktivnost: vise(sp["aktivnost"]).length ? vise(sp["aktivnost"]) : ["aktivni"],
    sort: sortiranje(sp, ["naziv", "stvoreno"] as const, { kljuc: "naziv", smjer: "asc" }),
    stranica: stranica(sp["stranica"]),
    velicina: velicina(sp["velicina"]),
  };
  const { ukupno, redovi } = await popisSifrarnika(k.db, k.firmaId, def, f, vidiNabavne);
  const polja = vidljivaPolja(def, vidiNabavne).filter((p) => def.stupci.includes(p.ime));
  const put = `/sifrarnici/${def.kljuc}`;

  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov={def.naslov}
        opis={def.opis}
        akcije={
          <>
            <GumbVeza href="/sifrarnici">Šifrarnici</GumbVeza>
            {imaPravo(k.prava, "sifrarnici", "operativno") && (
              <GumbVeza href={`${put}/novi`} varijanta="primarni">
                Novi zapis
              </GumbVeza>
            )}
          </>
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Traži po nazivu" />
          <FilterVise
            oznaka="Prikaz"
            parametar="aktivnost"
            opcije={[
              { vrijednost: "aktivni", naziv: "Aktivni" },
              { vrijednost: "neaktivni", naziv: "Deaktivirani" },
            ]}
          />
        </div>
        <Tablica<(typeof redovi)[number]>
          testId="popis-sifrarnika"
          putanja={put}
          parametri={sp}
          sort={f.sort}
          redovi={redovi}
          kljucReda={(r) => r.id}
          veza={(r) => `${put}/${r.id}`}
          stupci={polja.map((p) => ({
            kljuc: p.ime,
            naslov: p.oznaka.replace(/ \(.*\)$/, ""),
            sortira: p.ime === "naziv" ? "naziv" : undefined,
            desno: p.vrsta === "iznos" || p.vrsta === "postotak" || p.vrsta === "cijeli",
            prikaz: (r) =>
              p.ime === "naziv" ? (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {r.vrijednosti["naziv"]}
                  {!r.aktivan && <Znacka boja="crvena">deaktiviran</Znacka>}
                </span>
              ) : (
                r.vrijednosti[p.ime]
              ),
          }))}
        />
        <div className="mt-3">
          <Stranicenje
            putanja={put}
            parametri={{ ...Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b])) }}
            stranica={f.stranica}
            velicina={f.velicina}
            ukupno={ukupno}
          />
        </div>
      </Kartica>
    </Stranica>
  );
}
