import { notFound } from "next/navigation";
import { FilterGodina, FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbiIzvoza } from "@/components/ui/izvoz";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { formatirajIznos, zbroji } from "@/domain/novac";
import { jedan, sortiranje, stranica as procitajStranicu, vise } from "@/domain/popis";
import { trenutniKontekst } from "@/lib/akcija";
import { komponenteUkljucene } from "@/lib/razvoj";
import { DemoKomponente } from "./demo";

type Red = { id: string; naziv: string; status: string; iznos: number };
const STATUSI = ["Na skladištu", "U najmu", "Prodan", "Na servisu"];
const PODACI: Red[] = Array.from({ length: 120 }, (_, i) => ({
  id: String(i + 1),
  naziv: `Uređaj ${String(i + 1).padStart(3, "0")}`,
  status: STATUSI[i % 4]!,
  iznos: ((i * 7919) % 100000) + 99,
}));

/** Testna stranica zajedničkih komponenti (samo za testove u pregledniku). */
export default async function Komponente({ searchParams }: PageProps<"/razvoj/komponente">) {
  if (!komponenteUkljucene() || !(await trenutniKontekst())) notFound();
  const sp = await searchParams;
  const sort = sortiranje(sp, ["naziv", "iznos"], { kljuc: "naziv", smjer: "asc" });
  const statusi = vise(sp["status"]);
  const trazi = jedan(sp["trazi"])?.toLowerCase();
  const filtrirano = PODACI.filter(
    (r) => (statusi.length === 0 || statusi.includes(r.status)) && (!trazi || r.naziv.toLowerCase().includes(trazi)),
  ).sort((a, b) => (sort.kljuc === "iznos" ? a.iznos - b.iznos : a.naziv.localeCompare(b.naziv)) * (sort.smjer === "asc" ? 1 : -1));
  const str = procitajStranicu(sp["stranica"]);
  const redovi = filtrirano.slice((str - 1) * 25, str * 25);

  return (
    <Stranica sirina="7xl">
      <NaslovStranice naslov="Komponente" />
      <Kartica naslov="Godina">
        <FilterGodina godine={[2026, 2025, 2024]} zadano={2026} />
        <p data-testid="odabrana-godina">{jedan(sp["godina"]) ?? "zadano"}</p>
      </Kartica>
      <Kartica naslov="Pretraživač, dijalog, poruke">
        <DemoKomponente />
      </Kartica>
      <Kartica naslov="Tablica">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            <PoljePretrage placeholder="Traži uređaj" />
            <FilterVise oznaka="Status" parametar="status" opcije={STATUSI.map((s) => ({ vrijednost: s, naziv: s }))} />
          </div>
          <GumbiIzvoza izvor="korisnici" parametri={{}} />
        </div>
        <Tablica
          testId="tablica"
          putanja="/razvoj/komponente"
          parametri={sp}
          sort={sort}
          redovi={redovi}
          kljucReda={(r) => r.id}
          stupci={[
            { kljuc: "naziv", naslov: "Naziv", sortira: "naziv", prikaz: (r) => r.naziv },
            { kljuc: "status", naslov: "Status", prikaz: (r) => r.status },
            { kljuc: "iznos", naslov: "Iznos", sortira: "iznos", desno: true, prikaz: (r) => formatirajIznos(r.iznos) },
          ]}
          podnozje={["Ukupno", "", formatirajIznos(zbroji(filtrirano.map((r) => r.iznos)))]}
        />
        <div className="mt-3">
          <Stranicenje
            putanja="/razvoj/komponente"
            parametri={Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]))}
            stranica={str}
            velicina={25}
            ukupno={filtrirano.length}
          />
        </div>
      </Kartica>
    </Stranica>
  );
}
