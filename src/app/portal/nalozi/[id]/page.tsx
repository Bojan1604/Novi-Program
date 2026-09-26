import { notFound } from "next/navigation";
import { GumbVeza, klaseGumba } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Znacka } from "@/components/ui/stranica";
import { velicinaZaPrikaz } from "@/domain/prilozi";
import { STATUSI_SERVISA, type StatusServisa } from "@/domain/servis";
import { db } from "@/lib/db";
import { pristupPortalu } from "@/lib/portal";
import { nalogKlijenta } from "@/queries/portal";

export const metadata = { title: "Servisni nalog · Portal klijenata" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

export default async function PortalNalog({ params }: PageProps<"/portal/nalozi/[id]">) {
  const k = await pristupPortalu();
  const { id } = await params;
  const n = await nalogKlijenta(db, k, id);
  if (!n) notFound();
  return (
    <>
      <NaslovStranice
        naslov={`Servisni nalog ${n.broj}`}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            {n.uredaj.serijski} · {n.uredaj.model.proizvodjac.naziv} {n.uredaj.model.naziv}
            <Znacka boja="plava">{STATUSI_SERVISA[n.status as StatusServisa]}</Znacka>
          </span>
        }
        akcije={
          <>
            <a href={`/portal/nalozi/${n.id}/pdf`} target="_blank" rel="noopener" className={klaseGumba()}>
              Otpremnica (PDF)
            </a>
            <GumbVeza href="/portal/nalozi">Natrag</GumbVeza>
          </>
        }
      />
      <Kartica>
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-neutral-500">Prijavljeno / zaprimljeno</dt>
            <dd>{datum.format(n.datum)}</dd>
          </div>
          {n.zatvoren && (
            <div>
              <dt className="text-neutral-500">Završeno</dt>
              <dd>{datum.format(n.zatvoren)}</dd>
            </div>
          )}
          <div>
            <dt className="text-neutral-500">Opis kvara</dt>
            <dd className="break-words whitespace-pre-wrap">{n.opisKvara}</dd>
          </div>
          {n.napomenaKlijentu && (
            <div>
              <dt className="text-neutral-500">Napomena servisa</dt>
              <dd className="break-words whitespace-pre-wrap" data-testid="napomena-servisa">
                {n.napomenaKlijentu}
              </dd>
            </div>
          )}
          {n.zamjenski && (
            <div>
              <dt className="text-neutral-500">Zamjenski uređaj</dt>
              <dd>
                {n.zamjenski.serijski}
                {n.zamjenaDo ? ` (vraćen ${datum.format(n.zamjenaDo)})` : ""}
              </dd>
            </div>
          )}
        </dl>
      </Kartica>
      <Kartica naslov="Tijek">
        <ol className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="tijek-klijenta">
          {n.dogadaji.map((d) => (
            <li key={d.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-3">
              <span className="min-w-0 break-words whitespace-pre-wrap">{d.opis}</span>
              <span className="shrink-0 text-xs text-neutral-500">{vrijeme.format(d.vrijeme)}</span>
            </li>
          ))}
        </ol>
      </Kartica>
      {n.prilozi.length > 0 && (
        <Kartica naslov={`Prilozi (${n.prilozi.length})`}>
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="prilozi-klijenta">
            {n.prilozi.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <a href={`/portal/prilozi/${p.id}`} target="_blank" rel="noopener" className="break-all text-primarna-slova hover:underline">
                  {p.naziv}
                </a>
                <span className="text-xs text-neutral-500">{velicinaZaPrikaz(p.velicina)}</span>
              </li>
            ))}
          </ul>
        </Kartica>
      )}
    </>
  );
}
