import { FilterRazdoblja, FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbiIzvoza } from "@/components/ui/izvoz";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { formatirajIznos } from "@/domain/novac";
import { jedan, sortiranje, stranica, velicina, vise } from "@/domain/popis";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { VRSTE_PRODAJE, type VrstaProdaje } from "@/domain/prodaja";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { marzeDokumenata } from "@/queries/marze";
import { popisProdaje } from "@/queries/prodaja";

export const metadata = { title: "Računi · ERP-WMS" };

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const VRSTE = ["RACUN", "PREDUJAM", "STORNO", "ODOBRENJE"];

export default async function Racuni({ searchParams }: PageProps<"/racuni">) {
  const k = await pristupStranici("/racuni");
  const sp = await searchParams;
  const f = {
    vrsta: vise(sp["vrsta"]),
    trazi: jedan(sp["trazi"]),
    status: vise(sp["status"]),
    partnerId: jedan(sp["partner"]),
    placanje: jedan(sp["placanje"]),
    od: jedan(sp["od"]),
    do: jedan(sp["do"]),
    sort: sortiranje(sp, ["datum", "broj", "ukupno"] as const, { kljuc: "datum", smjer: "desc" }),
    stranica: stranica(sp["stranica"]),
    velicina: velicina(sp["velicina"]),
  };
  const r = await popisProdaje(k.db, k.firmaId, f, VRSTE);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  const smije = imaPravo(k.prava, "prodaja", "operativno");
  // marža samo uz pravo nabavnih cijena (računa se na poslužitelju, bez njega se ni ne dohvaća)
  const marze = imaPosebno(k.prava, "costs")
    ? new Map((await marzeDokumenata(db, k.firmaId, { ids: r.redovi.map((d) => d.id) })).map((m) => [m.id, m]))
    : null;
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Računi"
        akcije={
          smije && (
            <>
              <GumbVeza href="/racuni/nova" varijanta="primarni">
                Novi račun
              </GumbVeza>
              <GumbVeza href="/racuni/nova?vrsta=PREDUJAM">Račun za predujam</GumbVeza>
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
              { vrijednost: "STORNIRAN", naziv: "Stornirani" },
            ]}
          />
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Plaćanje">
            {[
              ["", "Svi"],
              ["OTVORENI", "Otvoreni"],
              ["ZA_POVRAT", "Za povrat"],
              ["PLACENI", "Plaćeni"],
            ].map(([v, n]) => (
              <GumbVeza
                key={v}
                malen
                varijanta={(f.placanje ?? "") === v ? "primarni" : "sekundarni"}
                href={`/racuni?${new URLSearchParams({ ...Object.fromEntries(Object.entries(ravni).filter(([a, b]) => a !== "placanje" && a !== "stranica" && typeof b === "string")), ...(v ? { placanje: v } : {}) } as Record<string, string>)}`}
              >
                {n}
              </GumbVeza>
            ))}
          </nav>
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
            {
              kljuc: "vrsta",
              naslov: "Vrsta",
              prikaz: (d) =>
                d.vrsta === "RACUN" ? (
                  d.status === "STORNIRAN" ? (
                    <Znacka boja="crvena">storniran</Znacka>
                  ) : (
                    ""
                  )
                ) : (
                  VRSTE_PRODAJE[d.vrsta as VrstaProdaje]?.naziv
                ),
            },
            { kljuc: "dospijece", naslov: "Dospijeće", prikaz: (d) => (d.dospijece ? datum.format(d.dospijece) : "") },
            { kljuc: "datum", naslov: "Datum", sortira: "datum", prikaz: (d) => datum.format(d.datum) },
            { kljuc: "kupac", naslov: "Kupac", prikaz: (d) => d.partner?.naziv ?? "" },
            { kljuc: "osnovica", naslov: "Osnovica", desno: true, prikaz: (d) => `${formatirajIznos(d.osnovica)} €` },
            { kljuc: "ukupno", naslov: "Ukupno", desno: true, sortira: "ukupno", prikaz: (d) => `${formatirajIznos(d.ukupno)} €` },
            {
              kljuc: "otvoreno",
              naslov: "Otvoreno",
              desno: true,
              prikaz: (d) => (d.status === "NACRT" ? "" : d.ukupno - d.placeno === 0 ? "" : `${formatirajIznos(d.ukupno - d.placeno)} €`),
            },
            ...(marze
              ? [
                  {
                    kljuc: "marza",
                    naslov: "Marža",
                    desno: true,
                    prikaz: (d: (typeof r.redovi)[number]) => {
                      const m = marze.get(d.id);
                      return m ? `${formatirajIznos(m.marza)} €${m.bezNabavne ? " *" : ""}` : "";
                    },
                  },
                ]
              : []),
            { kljuc: "korisnik", naslov: "Izradio", prikaz: (d) => d.korisnik },
          ]}
          podnozje={[
            "Ukupno (s stornima)",
            "",
            "",
            "",
            "",
            `${formatirajIznos(r.zbrojOsnovica)} €`,
            `${formatirajIznos(r.zbrojUkupno)} €`,
            `${formatirajIznos(r.zbrojOtvoreno)} €`,
            ...(marze ? [""] : []),
            "",
          ]}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <GumbiIzvoza izvor="racuni" parametri={sp} />
          <Stranicenje putanja="/racuni" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={r.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
