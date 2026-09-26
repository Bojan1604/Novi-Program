import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Znacka } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { STATUSI_SERVISA, type StatusServisa } from "@/domain/servis";
import { db } from "@/lib/db";
import { pristupPortalu } from "@/lib/portal";
import { STANJA_ZA_KLIJENTA, uredajKlijenta } from "@/queries/portal";
import { Jamstvo } from "../../jamstvo";

export const metadata = { title: "Uređaj · Portal klijenata" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function PortalUredaj({ params }: PageProps<"/portal/uredaji/[id]">) {
  const k = await pristupPortalu();
  const { id } = await params;
  const u = await uredajKlijenta(db, k, id);
  if (!u) notFound();
  const specifikacija = [u.cpu, u.ram, u.disk, u.os].filter(Boolean).join(" · ");
  return (
    <>
      <NaslovStranice
        naslov={u.serijski}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            {u.model.proizvodjac.naziv} {u.model.naziv} <Znacka>{STANJA_ZA_KLIJENTA[u.stanje] ?? u.stanje}</Znacka>
            <Jamstvo jamstvoDo={u.jamstvoDo} dan={danas()} />
          </span>
        }
        akcije={<GumbVeza href="/portal">Natrag</GumbVeza>}
      />
      {specifikacija && (
        <Kartica>
          <p className="text-sm break-words">{specifikacija}</p>
        </Kartica>
      )}
      <Kartica naslov={`Servisni nalozi (${u.nalozi.length})`}>
        {u.nalozi.length === 0 ? (
          <p className="text-sm text-neutral-500">Uređaj nije bio na servisu.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="nalozi-uredaja">
            {u.nalozi.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {n.broj} · {datum.format(n.datum)}
                </span>
                <Znacka>{STATUSI_SERVISA[n.status as StatusServisa]}</Znacka>
              </li>
            ))}
          </ul>
        )}
      </Kartica>
      <p className="text-xs text-neutral-500">
        Pitanja o uređaju? Javite se svom kontaktu u firmi. <Link href="/portal">Svi uređaji</Link>
      </p>
    </>
  );
}
