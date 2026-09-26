import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { jedan, sortiranje, stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { POPIS_VRSTA, STATUSI_DOKUMENTA, VRSTE_DOKUMENATA, type VrstaDokumenta } from "@/domain/skladisni-dokumenti";
import { pristupStranici } from "@/lib/akcija";
import { popisDokumenata } from "@/queries/skladisni-dokumenti";
import { ZnackaStatusa } from "./znacka";

export const metadata = { title: "Skladišni dokumenti · ERP-WMS" };

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function SkladisniDokumenti({ searchParams }: PageProps<"/skladisni">) {
  const k = await pristupStranici("/skladisni");
  const sp = await searchParams;
  const f = {
    trazi: jedan(sp["trazi"]),
    vrsta: vise(sp["vrsta"]),
    status: vise(sp["status"]),
    sort: sortiranje(sp, ["datum", "broj"] as const, { kljuc: "datum", smjer: "desc" }),
    stranica: stranica(sp["stranica"]),
    velicina: velicina(sp["velicina"]),
  };
  const r = await popisDokumenata(k.db, k.firmaId, f);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  const smije = imaPravo(k.prava, "uredaji", "operativno");

  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Skladišni dokumenti"
        opis="Međuskladišnice, izlazi (otpis, povrat dobavljaču…) i povrati na skladište"
        akcije={
          smije && (
            <>
              <GumbVeza href="/skladisni/nova?vrsta=MEDJUSKLADISNICA" varijanta="primarni">
                Međuskladišnica
              </GumbVeza>
              <GumbVeza href="/skladisni/nova?vrsta=IZLAZ">Izlaz</GumbVeza>
              <GumbVeza href="/skladisni/nova?vrsta=POVRAT">Povrat</GumbVeza>
            </>
          )
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Broj, razlog, partner, serijski" />
          <FilterVise oznaka="Vrsta" parametar="vrsta" opcije={POPIS_VRSTA.map((v) => ({ vrijednost: v, naziv: VRSTE_DOKUMENATA[v].naziv }))} />
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={Object.entries(STATUSI_DOKUMENTA).map(([vrijednost, naziv]) => ({ vrijednost, naziv }))}
          />
        </div>
        <Tablica
          testId="popis-dokumenata"
          putanja="/skladisni"
          parametri={sp}
          sort={f.sort}
          redovi={r.redovi}
          kljucReda={(d) => d.id}
          veza={(d) => `/skladisni/${d.id}`}
          stupci={[
            { kljuc: "broj", naslov: "Broj", sortira: "broj", prikaz: (d) => d.broj },
            { kljuc: "vrsta", naslov: "Vrsta", prikaz: (d) => VRSTE_DOKUMENATA[d.vrsta as VrstaDokumenta]?.naziv ?? d.vrsta },
            { kljuc: "datum", naslov: "Datum", sortira: "datum", prikaz: (d) => datum.format(d.datum) },
            {
              kljuc: "smjer",
              naslov: "Iz → u",
              prikaz: (d) => `${d.skladisteIz?.naziv ?? d.partner?.naziv ?? "—"} → ${d.skladisteU?.naziv ?? d.razlog ?? "—"}`,
            },
            { kljuc: "uredaja", naslov: "Uređaja", desno: true, prikaz: (d) => d.brojUredaja.toLocaleString("hr-HR") },
            { kljuc: "korisnik", naslov: "Izdao", prikaz: (d) => d.korisnik },
            { kljuc: "status", naslov: "Status", prikaz: (d) => <ZnackaStatusa status={d.status} /> },
          ]}
          podnozje={["Provedeno", "", "", "", r.zbrojUredaja.toLocaleString("hr-HR"), "", ""]}
        />
        <div className="mt-3">
          <Stranicenje putanja="/skladisni" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={r.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
