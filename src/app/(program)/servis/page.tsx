import { FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { jedan, stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { STATUSI_SERVISA, type StatusServisa } from "@/domain/servis";
import { normalizirajSerijski } from "@/domain/stanja-uredaja";
import type { Prisma } from "@/generated/prisma/client";
import { pristupStranici } from "@/lib/akcija";
import { bojaStatusa } from "./boje";

export const metadata = { title: "Servisni nalozi · ERP-WMS" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function Servis({ searchParams }: PageProps<"/servis">) {
  const k = await pristupStranici("/servis");
  const sp = await searchParams;
  const trazi = jedan(sp["trazi"])?.trim();
  const statusi = vise(sp["status"]).filter((s) => s in STATUSI_SERVISA);
  const str = stranica(sp["stranica"]);
  const vel = velicina(sp["velicina"]);
  // pretraga po serijskom: prvo id-evi uređaja (indeks), pa nalozi — bez spajanja velikih tablica
  const uredaji = trazi
    ? await k.db.uredaj.findMany({
        where: { firmaId: k.firmaId, serijski: { contains: normalizirajSerijski(trazi) } },
        select: { id: true },
        take: 200,
      })
    : [];
  const where: Prisma.ServisniNalogWhereInput = {
    firmaId: k.firmaId,
    ...(statusi.length ? { status: { in: statusi } } : {}),
    ...(trazi
      ? {
          OR: [
            { broj: { contains: trazi, mode: "insensitive" } },
            { partner: { naziv: { contains: trazi, mode: "insensitive" } } },
            { uredajId: { in: uredaji.map((u) => u.id) } },
          ],
        }
      : {}),
  };
  const [ukupno, redovi] = await Promise.all([
    k.db.servisniNalog.count({ where }),
    k.db.servisniNalog.findMany({
      where,
      orderBy: [{ datum: "desc" }, { redni: "desc" }],
      skip: (str - 1) * vel,
      take: vel,
      select: {
        id: true,
        broj: true,
        datum: true,
        status: true,
        opisKvara: true,
        izvor: true,
        uredaj: { select: { serijski: true, model: { select: { naziv: true } } } },
        partner: { select: { naziv: true } },
        zamjenaOd: true,
        zamjenaDo: true,
      },
    }),
  ]);
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Servisni nalozi"
        akcije={
          imaPravo(k.prava, "servis", "operativno") && (
            <GumbVeza href="/servis/novi" varijanta="primarni">
              Prijem na servis
            </GumbVeza>
          )
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <PoljePretrage placeholder="Broj, serijski, klijent" />
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={Object.entries(STATUSI_SERVISA).map(([vrijednost, naziv]) => ({ vrijednost, naziv }))}
          />
        </div>
        <Tablica
          testId="popis-servisa"
          putanja="/servis"
          parametri={sp}
          redovi={redovi}
          kljucReda={(n) => n.id}
          veza={(n) => `/servis/${n.id}`}
          stupci={[
            { kljuc: "broj", naslov: "Broj", prikaz: (n) => n.broj },
            { kljuc: "datum", naslov: "Zaprimljen", prikaz: (n) => datum.format(n.datum) },
            { kljuc: "uredaj", naslov: "Uređaj", prikaz: (n) => `${n.uredaj.serijski} · ${n.uredaj.model.naziv}` },
            { kljuc: "klijent", naslov: "Klijent", prikaz: (n) => n.partner?.naziv ?? "—" },
            { kljuc: "kvar", naslov: "Kvar", prikaz: (n) => <span className="line-clamp-2 break-words">{n.opisKvara}</span> },
            {
              kljuc: "status",
              naslov: "Status",
              prikaz: (n) => (
                <span className="inline-flex flex-wrap gap-1">
                  <Znacka boja={bojaStatusa(n.status)}>{STATUSI_SERVISA[n.status as StatusServisa]}</Znacka>
                  {n.zamjenaOd && !n.zamjenaDo && <Znacka>zamjenski</Znacka>}
                  {n.izvor === "PORTAL" && <Znacka>portal</Znacka>}
                </span>
              ),
            },
          ]}
        />
        <div className="mt-3">
          <Stranicenje putanja="/servis" parametri={ravni} stranica={str} velicina={vel} ukupno={ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
