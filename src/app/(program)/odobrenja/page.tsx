import Link from "next/link";
import { FilterVise } from "@/components/ui/filtri";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { stranica, velicina, vise } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { popisOdobrenja } from "@/queries/skladisni-dokumenti";
import { Odluka } from "../skladisni/odluka";

export const metadata = { title: "Odobrenja · ERP-WMS" };

const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });
const PUTANJE: Record<string, string> = { SkladisniDokument: "/skladisni" };

export default async function Odobrenja({ searchParams }: PageProps<"/odobrenja">) {
  const k = await pristupStranici("/odobrenja");
  const sp = await searchParams;
  const status = sp["status"] === undefined ? ["CEKA"] : vise(sp["status"]);
  const f = { status, stranica: stranica(sp["stranica"]), velicina: velicina(sp["velicina"]) };
  const r = await popisOdobrenja(k.db, k.firmaId, f);
  const smije = imaPravo(k.prava, "uredaji", "puno");
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Odobrenja" opis={`Zahtjevi koje mora odobriti drugi korisnik · čeka: ${r.ceka}`} />
      <Kartica>
        <div className="mb-3">
          <FilterVise
            oznaka="Status"
            parametar="status"
            opcije={[
              { vrijednost: "CEKA", naziv: "Čeka" },
              { vrijednost: "ODOBRENO", naziv: "Odobreno" },
              { vrijednost: "ODBIJENO", naziv: "Odbijeno" },
            ]}
          />
        </div>
        {r.redovi.length === 0 ? (
          <p className="text-sm text-neutral-500">Nema zahtjeva.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="odobrenja">
            {r.redovi.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`${PUTANJE[o.entitet] ?? ""}/${o.entitetId}`} className="font-medium text-primarna-slova hover:underline">
                    {o.opis}
                  </Link>
                  {o.status !== "CEKA" && (
                    <Znacka boja={o.status === "ODOBRENO" ? "zelena" : "crvena"}>{o.status === "ODOBRENO" ? "odobreno" : "odbijeno"}</Znacka>
                  )}
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  Zatražio {o.podnio}, {vrijeme.format(o.stvoreno)}
                  {o.odlucio && ` · ${o.status === "ODOBRENO" ? "odobrio" : "odbio"} ${o.odlucio}`}
                  {o.razlog && ` — ${o.razlog}`}
                </div>
                {o.status === "CEKA" && smije && o.podnioId !== k.korisnikId && <Odluka odobrenjeId={o.id} />}
                {o.status === "CEKA" && o.podnioId === k.korisnikId && (
                  <div className="text-xs text-neutral-500">Vaš zahtjev — odobrava drugi korisnik.</div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Stranicenje putanja="/odobrenja" parametri={ravni} stranica={f.stranica} velicina={f.velicina} ukupno={r.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
