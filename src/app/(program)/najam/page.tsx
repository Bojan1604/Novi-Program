import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { danas } from "@/domain/datum";
import { jedan, stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { statusUgovora, STATUSI_UGOVORA, type StatusUgovora } from "@/domain/ugovor-najma";
import { pristupStranici } from "@/lib/akcija";
import { popisUgovora } from "@/queries/najam";

export const metadata = { title: "Ugovori o najmu · ERP-WMS" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const dan = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
const BOJE: Record<StatusUgovora, "zelena" | "siva" | "crvena" | "plava"> = {
  AKTIVAN: "zelena",
  NA_CEKANJU: "plava",
  ISTEKAO: "siva",
  OTKAZAN: "crvena",
};

export default async function Najam({ searchParams }: PageProps<"/najam">) {
  const k = await pristupStranici("/najam");
  const sp = await searchParams;
  const d0 = danas();
  const f = {
    trazi: jedan(sp["trazi"]),
    status: vise(sp["status"]),
    partnerId: jedan(sp["partner"]),
    stranica: stranica(sp["stranica"]),
    velicina: velicina(sp["velicina"]),
  };
  const r = await popisUgovora(k.db, k.firmaId, f, d0);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Ugovori o najmu"
        akcije={
          imaPravo(k.prava, "najam", "operativno") && (
            <GumbVeza href="/najam/novi" varijanta="primarni">
              Novi ugovor
            </GumbVeza>
          )
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Broj, kupac, uvjeti" />
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={Object.entries(STATUSI_UGOVORA).map(([vrijednost, naziv]) => ({ vrijednost, naziv }))}
          />
        </div>
        <Tablica
          testId="popis-ugovora"
          putanja="/najam"
          parametri={sp}
          redovi={r.redovi}
          kljucReda={(u) => u.id}
          veza={(u) => `/najam/${u.id}`}
          stupci={[
            { kljuc: "broj", naslov: "Broj", prikaz: (u) => u.broj },
            { kljuc: "kupac", naslov: "Kupac", prikaz: (u) => u.partner.naziv + (u.poslovnica ? ` · ${u.poslovnica.naziv}` : "") },
            { kljuc: "od", naslov: "Od", prikaz: (u) => datum.format(u.od) },
            { kljuc: "do", naslov: "Do", prikaz: (u) => (u.do ? datum.format(u.do) : "neodređeno") },
            {
              kljuc: "status",
              naslov: "Status",
              prikaz: (u) => {
                const s = statusUgovora({ od: dan(u.od)!, do: dan(u.do), otkazan: dan(u.otkazan) }, d0);
                return <Znacka boja={BOJE[s]}>{STATUSI_UGOVORA[s]}</Znacka>;
              },
            },
          ]}
        />
        <div className="mt-3">
          <Stranicenje putanja="/najam" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={r.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
