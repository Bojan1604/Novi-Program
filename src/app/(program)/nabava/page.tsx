import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { STATUSI_NARUDZBE, type StatusNarudzbe } from "@/domain/nabava";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { jedan, stranica, velicina, vise } from "@/domain/popis";
import { imaPosebno, imaPravo } from "@/domain/prava";
import type { Prisma } from "@/generated/prisma/client";
import { pristupStranici } from "@/lib/akcija";

export const metadata = { title: "Narudžbenice · ERP-WMS" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function Nabava({ searchParams }: PageProps<"/nabava">) {
  const k = await pristupStranici("/nabava");
  const sp = await searchParams;
  const trazi = jedan(sp["trazi"])?.trim();
  const statusi = vise(sp["status"]).filter((s) => s in STATUSI_NARUDZBE);
  const str = stranica(sp["stranica"]);
  const vel = velicina(sp["velicina"]);
  const where: Prisma.NarudzbenicaWhereInput = {
    firmaId: k.firmaId,
    ...(statusi.length ? { status: { in: statusi } } : {}),
    ...(trazi
      ? { OR: [{ broj: { contains: trazi, mode: "insensitive" } }, { dobavljac: { naziv: { contains: trazi, mode: "insensitive" } } }] }
      : {}),
  };
  const [ukupno, redovi] = await Promise.all([
    k.db.narudzbenica.count({ where }),
    k.db.narudzbenica.findMany({
      where,
      orderBy: [{ datum: "desc" }, { redni: "desc" }],
      skip: (str - 1) * vel,
      take: vel,
      select: {
        id: true,
        broj: true,
        datum: true,
        status: true,
        osnovica: true,
        dobavljac: { select: { naziv: true } },
        stavke: { select: { kolicina: true, zaprimljeno: true } },
      },
    }),
  ]);
  const vidiCijene = imaPosebno(k.prava, "costs");
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Narudžbenice"
        akcije={
          imaPravo(k.prava, "nabava", "operativno") && (
            <GumbVeza href="/nabava/nova" varijanta="primarni">
              Nova narudžbenica
            </GumbVeza>
          )
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Broj, dobavljač" />
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={Object.entries(STATUSI_NARUDZBE).map(([vrijednost, naziv]) => ({ vrijednost, naziv }))}
          />
        </div>
        <Tablica
          testId="popis-narudzbenica"
          putanja="/nabava"
          parametri={sp}
          redovi={redovi}
          kljucReda={(n) => n.id}
          veza={(n) => `/nabava/${n.id}`}
          stupci={[
            { kljuc: "broj", naslov: "Broj", prikaz: (n) => n.broj },
            { kljuc: "datum", naslov: "Datum", prikaz: (n) => datum.format(n.datum) },
            { kljuc: "dobavljac", naslov: "Dobavljač", prikaz: (n) => n.dobavljac.naziv },
            {
              kljuc: "kolicina",
              naslov: "Zaprimljeno",
              desno: true,
              prikaz: (n) => `${n.stavke.reduce((a, s) => a + s.zaprimljeno, 0)} / ${n.stavke.reduce((a, s) => a + s.kolicina, 0)}`,
            },
            ...(vidiCijene
              ? [
                  {
                    kljuc: "osnovica",
                    naslov: "Iznos",
                    desno: true,
                    prikaz: (n: (typeof redovi)[number]) => `${formatirajIznos(centiIzDecimala(n.osnovica.toFixed(2)))} €`,
                  },
                ]
              : []),
            {
              kljuc: "status",
              naslov: "Status",
              prikaz: (n) => (
                <Znacka
                  boja={n.status === "ZAPRIMLJENA" ? "zelena" : n.status === "STORNIRANA" ? "crvena" : n.status === "DJELOMICNO" ? "zuta" : "siva"}
                >
                  {STATUSI_NARUDZBE[n.status as StatusNarudzbe]}
                </Znacka>
              ),
            },
          ]}
        />
        <div className="mt-3">
          <Stranicenje putanja="/nabava" parametri={ravni} stranica={str} velicina={vel} ukupno={ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
