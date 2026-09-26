import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterVise } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { REZULTATI, type Rezultat } from "@/domain/inventura";
import { stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { STANJA, type Stanje } from "@/domain/stanja-uredaja";
import { pristupStranici } from "@/lib/akcija";
import { inventura } from "@/queries/inventure";
import { SkeniranjeInventure, UkloniStavku, Zakljuci } from "../obrasci";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const BOJE: Record<Rezultat, "zelena" | "crvena" | "zuta" | "siva"> = { PRONADJEN: "zelena", MANJAK: "crvena", VISAK: "zuta", NEPOZNAT: "zuta" };

function Broj({ naziv, vrijednost, boja = "" }: { naziv: string; vrijednost: number | null; boja?: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{naziv}</span>
      <span className={`text-2xl font-semibold tabular-nums ${boja}`}>{vrijednost?.toLocaleString("hr-HR") ?? "—"}</span>
    </div>
  );
}

export default async function Inventura({ params, searchParams }: PageProps<"/inventure/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/inventure");
  const sp = await searchParams;
  const f = { rezultat: vise(sp["rezultat"]), stranica: stranica(sp["stranica"]), velicina: velicina(sp["velicina"]) };
  const inv = await inventura(k.db, k.firmaId, id, f);
  if (!inv) notFound();
  const otvorena = inv.status === "OTVORENA";
  const smije = imaPravo(k.prava, "uredaji", "operativno");
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));

  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={`Inventura ${inv.broj}`}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            {inv.skladiste.naziv} · {datum.format(inv.datum)} · {inv.korisnik}
            {otvorena ? <Znacka boja="plava">otvorena</Znacka> : <Znacka>zaključena</Znacka>}
          </span>
        }
        akcije={<GumbVeza href="/inventure">Natrag</GumbVeza>}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="brojevi-inventure">
        {otvorena && inv.zivo ? (
          <>
            <Broj naziv="U programu (skladište)" vrijednost={inv.zivo.ocekivano} />
            <Broj naziv="Skenirano" vrijednost={inv.zivo.skenirano} />
            <Broj naziv="Od toga pronađeno" vrijednost={inv.zivo.pronadjeno} boja="text-green-700 dark:text-green-400" />
            <Broj naziv="Još nije skenirano" vrijednost={inv.zivo.ocekivano - inv.zivo.pronadjeno} />
          </>
        ) : (
          <>
            <Broj naziv="U programu" vrijednost={inv.ocekivano} />
            <Broj naziv="Pronađeno" vrijednost={inv.pronadjeno} boja="text-green-700 dark:text-green-400" />
            <Broj naziv="Manjak" vrijednost={inv.manjak} boja={inv.manjak ? "text-red-700 dark:text-red-400" : ""} />
            <Broj naziv="Višak" vrijednost={inv.visak} boja={inv.visak ? "text-amber-700 dark:text-amber-400" : ""} />
          </>
        )}
      </div>
      {otvorena && smije && (
        <Kartica naslov="Skeniranje">
          <SkeniranjeInventure id={inv.id} />
        </Kartica>
      )}
      <Kartica naslov={otvorena ? "Skenirano" : "Rezultat"}>
        {!otvorena && (
          <div className="mb-3">
            <FilterVise
              oznaka="Rezultat"
              parametar="rezultat"
              opcije={Object.entries(REZULTATI).map(([vrijednost, naziv]) => ({ vrijednost, naziv }))}
            />
          </div>
        )}
        {inv.stavke.length === 0 ? (
          <p className="text-sm text-neutral-500">{otvorena ? "Još ništa nije skenirano." : "Nema stavki."}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="stavke-inventure">
            {inv.stavke.map((s) => {
              const rez = (s.rezultat ?? (s.uredaj ? (s.uredaj.skladisteId === inv.skladisteId ? "PRONADJEN" : "VISAK") : "NEPOZNAT")) as Rezultat;
              const stanje = (s.stanje ?? s.uredaj?.stanje) as Stanje | undefined;
              const skl = s.skladiste ?? s.uredaj?.skladiste?.naziv;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    {s.uredaj ? (
                      <Link href={`/uredaji/${s.uredaj.id}`} className="font-mono text-primarna hover:underline">
                        {s.serijski}
                      </Link>
                    ) : (
                      <span className="font-mono">{s.serijski}</span>
                    )}
                    <span className="ml-2">
                      <Znacka boja={BOJE[rez]}>{REZULTATI[rez]}</Znacka>
                    </span>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      {[s.uredaj?.model.naziv, stanje && STANJA[stanje], skl].filter(Boolean).join(" · ")}
                      {s.skenirano > 1 && ` · skenirano ${s.skenirano}×`}
                    </div>
                  </div>
                  {otvorena && smije && <UkloniStavku id={inv.id} serijski={s.serijski} />}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <Stranicenje putanja={`/inventure/${inv.id}`} parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={inv.ukupno} />
        </div>
        {!otvorena && (inv.manjak ?? 0) + (inv.visak ?? 0) > 0 && (
          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            Razlike se ispravljaju dokumentima: manjak{" "}
            <Link href="/skladisni/nova?vrsta=IZLAZ" className="text-primarna hover:underline">
              izlazom
            </Link>{" "}
            (uz odobrenje), višak iz drugog skladišta{" "}
            <Link href="/skladisni/nova?vrsta=MEDJUSKLADISNICA" className="text-primarna hover:underline">
              međuskladišnicom
            </Link>
            .
          </p>
        )}
      </Kartica>
      {otvorena && smije && inv.zivo && (
        <Kartica naslov="Zaključenje">
          <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
            Zaključenje uspoređuje skenirano sa stanjem u programu i sprema manjak i višak. Uređaji se ne mijenjaju.
          </p>
          <Zakljuci id={inv.id} skenirano={inv.zivo.skenirano} ocekivano={inv.zivo.ocekivano} />
        </Kartica>
      )}
    </Stranica>
  );
}
