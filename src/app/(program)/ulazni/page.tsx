import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { jedan, stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { STATUSI_ULAZNIH } from "@/domain/ulazni";
import type { Prisma } from "@/generated/prisma/client";
import { pristupStranici } from "@/lib/akcija";
import { PreuzimanjeERacuna } from "./obrazac";

export const metadata = { title: "Ulazni računi · ERP-WMS" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function UlazniRacuni({ searchParams }: PageProps<"/ulazni">) {
  const k = await pristupStranici("/ulazni");
  const sp = await searchParams;
  const trazi = jedan(sp["trazi"])?.trim();
  const statusi = vise(sp["status"]).filter((s) => s in STATUSI_ULAZNIH);
  const str = stranica(sp["stranica"]);
  const vel = velicina(sp["velicina"]);
  const where: Prisma.UlazniRacunWhereInput = {
    firmaId: k.firmaId,
    ...(statusi.length ? { status: { in: statusi } } : {}),
    ...(trazi
      ? {
          OR: [
            { broj: { contains: trazi, mode: "insensitive" } },
            { interni: { contains: trazi, mode: "insensitive" } },
            { dobavljacTekst: { contains: trazi, mode: "insensitive" } },
            { dobavljac: { naziv: { contains: trazi, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [ukupno, redovi] = await Promise.all([
    k.db.ulazniRacun.count({ where }),
    k.db.ulazniRacun.findMany({
      where,
      orderBy: [{ datum: "desc" }, { redni: "desc" }],
      skip: (str - 1) * vel,
      take: vel,
      select: {
        id: true,
        interni: true,
        broj: true,
        datum: true,
        ukupno: true,
        status: true,
        zaRobu: true,
        izvor: true,
        dobavljacTekst: true,
        dobavljac: { select: { naziv: true } },
      },
    }),
  ]);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Ulazni računi"
        akcije={
          imaPravo(k.prava, "nabava", "operativno") && (
            <GumbVeza href="/ulazni/novi" varijanta="primarni">
              Novi ulazni račun
            </GumbVeza>
          )
        }
      />
      <Kartica>
        {imaPravo(k.prava, "nabava", "operativno") && (
          <div className="mb-4">
            <PreuzimanjeERacuna demo={(process.env["ERACUN_POSREDNIK"] ?? "demo") === "demo"} />
          </div>
        )}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Broj, dobavljač" />
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={Object.entries(STATUSI_ULAZNIH).map(([vrijednost, naziv]) => ({ vrijednost, naziv }))}
          />
        </div>
        <Tablica
          testId="popis-ulaznih"
          putanja="/ulazni"
          parametri={sp}
          redovi={redovi}
          kljucReda={(r) => r.id}
          veza={(r) => `/ulazni/${r.id}`}
          stupci={[
            { kljuc: "interni", naslov: "URA", prikaz: (r) => r.interni },
            { kljuc: "broj", naslov: "Broj dobavljača", prikaz: (r) => r.broj },
            { kljuc: "datum", naslov: "Datum", prikaz: (r) => datum.format(r.datum) },
            { kljuc: "dobavljac", naslov: "Dobavljač", prikaz: (r) => r.dobavljac?.naziv ?? r.dobavljacTekst ?? "" },
            { kljuc: "ukupno", naslov: "Ukupno", desno: true, prikaz: (r) => `${formatirajIznos(centiIzDecimala(r.ukupno.toFixed(2)))} €` },
            {
              kljuc: "status",
              naslov: "Status",
              prikaz: (r) => (
                <span className="inline-flex flex-wrap gap-1">
                  <Znacka boja={r.status === "STORNIRAN" || r.status === "ODBIJEN" ? "crvena" : r.status === "PRIMLJEN" ? "zuta" : "siva"}>
                    {STATUSI_ULAZNIH[r.status] ?? r.status}
                  </Znacka>
                  {r.zaRobu && <Znacka boja="plava">roba</Znacka>}
                  {r.izvor === "ERACUN" && <Znacka>eRačun</Znacka>}
                </span>
              ),
            },
          ]}
        />
        <div className="mt-3">
          <Stranicenje putanja="/ulazni" parametri={ravni} stranica={str} velicina={vel} ukupno={ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
