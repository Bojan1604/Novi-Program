import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbiIzvoza } from "@/components/ui/izvoz";
import { GumbNaljepnice } from "@/components/ui/naljepnice";
import { NAJVISE_NALJEPNICA } from "@/domain/naljepnice";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica, type Stupac } from "@/components/ui/tablica";
import { formatirajIznos } from "@/domain/novac";
import { jedan, sortiranje, stranica, velicina, vise } from "@/domain/popis";
import { imaPosebno } from "@/domain/prava";
import { POPIS_STANJA, STANJA, type Stanje } from "@/domain/stanja-uredaja";
import { odabraniStupci, SORTIRANJA_UREDAJA, STUPCI_UREDAJA, type KljucStupca } from "@/domain/stupci-uredaja";
import { pristupStranici } from "@/lib/akcija";
import { opcijeFiltaraUredaja, popisUredaja } from "@/queries/uredaji";
import { OdabirStupaca } from "./stupci";

export const metadata = { title: "Uređaji · ERP-WMS" };

const KOLACIC = "stupci-uredaji";
const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const BOJE: Record<Stanje, "siva" | "zelena" | "crvena" | "plava" | "zuta"> = {
  U_DOLASKU: "siva",
  NA_SKLADISTU: "zelena",
  REZERVIRAN: "zuta",
  PRODAN: "plava",
  U_NAJMU: "plava",
  NA_SERVISU: "zuta",
  OTPISAN: "crvena",
};

export default async function Uredaji({ searchParams }: PageProps<"/uredaji">) {
  const k = await pristupStranici("/uredaji");
  const sp = await searchParams;
  const vidiNabavne = imaPosebno(k.prava, "costs");
  const f = {
    trazi: jedan(sp["trazi"]),
    stanje: vise(sp["stanje"]),
    skladiste: vise(sp["skladiste"]),
    kategorija: vise(sp["kategorija"]),
    proizvodjac: vise(sp["proizvodjac"]),
    partnerId: jedan(sp["partner"]),
    primkaId: jedan(sp["primka"]),
    serijski: vise(sp["serijski"]),
    od: jedan(sp["od"]),
    do: jedan(sp["do"]),
    jamstvoDo: jedan(sp["jamstvoDo"]),
    sort: sortiranje(sp, SORTIRANJA_UREDAJA, { kljuc: "stvoreno", smjer: "desc" }),
    stranica: stranica(sp["stranica"]),
    velicina: velicina(sp["velicina"]),
  };
  const [r, opcije] = await Promise.all([popisUredaja(k.db, k.firmaId, f, vidiNabavne), opcijeFiltaraUredaja(k.db, k.firmaId)]);
  const stupci = odabraniStupci((await cookies()).get(KOLACIC)?.value, vidiNabavne);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  type Red = (typeof r.redovi)[number];

  const svi: Record<KljucStupca, Omit<Stupac<Red>, "kljuc">> = {
    model: { naslov: "Model", prikaz: (u) => `${u.model.proizvodjac.naziv} ${u.model.naziv}` },
    kategorija: { naslov: "Kategorija", prikaz: (u) => u.model.kategorija.naziv },
    stanje: { naslov: "Stanje", sortira: "stanje", prikaz: (u) => <Znacka boja={BOJE[u.stanje as Stanje]}>{STANJA[u.stanje as Stanje]}</Znacka> },
    lokacija: {
      naslov: "Skladište / kupac",
      prikaz: (u): ReactNode =>
        u.partner ? (
          <Link href={`/partneri/${u.partner.id}`} className="relative z-10 text-primarna hover:underline">
            {u.partner.naziv}
          </Link>
        ) : (
          (u.skladiste?.naziv ?? "")
        ),
    },
    stanjeRobe: { naslov: "Stanje robe", prikaz: (u) => u.stanjeRobe?.naziv ?? "" },
    nabavnaCijena: {
      naslov: "Nabavna cijena",
      sortira: "nabavnaCijena",
      desno: true,
      prikaz: (u) => (u.nabavnaCijena === null ? "" : `${formatirajIznos(u.nabavnaCijena)} €`),
    },
    nabavniDatum: { naslov: "Zaprimljen", sortira: "nabavniDatum", prikaz: (u) => (u.nabavniDatum ? datum.format(u.nabavniDatum) : "") },
    jamstvoDo: { naslov: "Jamstvo do", sortira: "jamstvoDo", prikaz: (u) => (u.jamstvoDo ? datum.format(u.jamstvoDo) : "") },
    primka: { naslov: "Primka", prikaz: (u) => u.primka?.broj ?? "" },
    cpu: { naslov: "Procesor", prikaz: (u) => u.cpu ?? "" },
    ram: { naslov: "RAM", prikaz: (u) => u.ram ?? "" },
    disk: { naslov: "Disk", prikaz: (u) => u.disk ?? "" },
    ekran: { naslov: "Ekran", prikaz: (u) => u.ekran ?? "" },
    os: { naslov: "OS", prikaz: (u) => u.os ?? "" },
    napomena: { naslov: "Napomena", prikaz: (u) => u.napomena ?? "" },
  };
  const kolone: Stupac<Red>[] = [
    { kljuc: "serijski", naslov: "Serijski", sortira: "serijski", mobitel: "naslov", prikaz: (u) => <span className="font-mono">{u.serijski}</span> },
    ...stupci.map((s) => ({ kljuc: s, ...svi[s] })),
  ];

  return (
    <Stranica sirina="puna">
      <NaslovStranice
        naslov="Uređaji"
        opis={
          <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
            <span>
              <strong>{r.ukupno.toLocaleString("hr-HR")}</strong> uređaja
            </span>
            {POPIS_STANJA.filter((s) => r.poStanju[s]).map((s) => (
              <span key={s}>
                {STANJA[s]}: {r.poStanju[s]!.toLocaleString("hr-HR")}
              </span>
            ))}
            {r.zbrojNabavno !== null && <span>Nabavno: {formatirajIznos(r.zbrojNabavno)} €</span>}
          </span>
        }
        akcije={
          <>
            <OdabirStupaca
              svi={STUPCI_UREDAJA.filter((s) => vidiNabavne || !("osjetljivo" in s)).map(({ kljuc, naslov }) => ({ kljuc, naslov }))}
              odabrani={stupci}
              kolacic={KOLACIC}
            />
            <GumbiIzvoza izvor="uredaji" parametri={sp} />
            {r.ukupno > 0 && r.ukupno <= NAJVISE_NALJEPNICA && <GumbNaljepnice parametri={{ ...sp, popis: "1" }} />}
          </>
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col flex-wrap gap-2 sm:flex-row">
          <PoljePretrage placeholder="Serijski broj ili model" />
          <FilterVise oznaka="Stanje" parametar="stanje" opcije={POPIS_STANJA.map((s) => ({ vrijednost: s, naziv: STANJA[s] }))} />
          <FilterVise oznaka="Skladište" parametar="skladiste" opcije={opcije.skladista} />
          <FilterVise oznaka="Kategorija" parametar="kategorija" opcije={opcije.kategorije} />
          <FilterVise oznaka="Proizvođač" parametar="proizvodjac" opcije={opcije.proizvodjaci} />
        </div>
        {f.serijski.length > 0 && (
          <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
            Samo skenirani uređaji ({f.serijski.length}).{" "}
            <Link href="/uredaji" className="text-primarna hover:underline">
              Prikaži sve
            </Link>
          </p>
        )}
        <Tablica
          testId="popis-uredaja"
          putanja="/uredaji"
          parametri={sp}
          sort={f.sort}
          redovi={r.redovi}
          kljucReda={(u) => u.id}
          veza={(u) => `/uredaji/${u.id}`}
          stupci={kolone}
          prazno="Nema uređaja za odabrane filtre."
        />
        <div className="mt-3">
          <Stranicenje putanja="/uredaji" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={r.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
