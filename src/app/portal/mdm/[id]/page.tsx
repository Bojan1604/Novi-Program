import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Znacka } from "@/components/ui/stranica";
import { naVezi, PLATFORME, type Platforma } from "@/domain/mdm";
import { db } from "@/lib/db";
import { pristupPortalu } from "@/lib/portal";
import { organizacijaPartnera } from "@/services/mdm";

export const metadata = { title: "MDM organizacija · Portal klijenata" };
export const dynamic = "force-dynamic";

const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

export default async function PortalOrganizacija({ params }: PageProps<"/portal/mdm/[id]">) {
  const k = await pristupPortalu();
  const { id } = await params;
  const o = await organizacijaPartnera(db, k.firmaId, k.partnerId, id);
  if (!o) notFound();
  const sada = new Date();
  return (
    <>
      <NaslovStranice naslov={o.naziv} akcije={<GumbVeza href="/portal/mdm">Natrag</GumbVeza>} />
      <Kartica naslov="Upis uređaja">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR s poslužitelja (PNG) */}
          <img
            src={`/portal/mdm/${o.id}/qr`}
            alt={`QR za upis u ${o.naziv}`}
            width={180}
            height={180}
            className="rounded border border-neutral-200"
          />
          <div className="flex min-w-0 flex-col gap-2 text-sm">
            <span className="text-neutral-500">Kod upisa za agenta</span>
            <code className="text-xl font-semibold tracking-wider" data-testid="kod-upisa">
              {o.kodUpisa}
            </code>
          </div>
        </div>
      </Kartica>
      <Kartica naslov={`Uređaji (${o.uredaji.length})`}>
        {o.uredaji.length === 0 ? (
          <p className="text-sm text-neutral-500">Još nema upisanih uređaja.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="portal-mdm-uredaji">
            {o.uredaji.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="break-all">
                  {u.serijski}
                  {u.naziv ? ` · ${u.naziv}` : ""}
                </span>
                <span className="flex flex-wrap gap-1">
                  <Znacka>{PLATFORME[u.platforma as Platforma]}</Znacka>
                  {u.stanje === "BLOKIRAN" ? (
                    <Znacka boja="crvena">blokiran</Znacka>
                  ) : naVezi(u.zadnjiKontakt, sada) ? (
                    <Znacka boja="zelena">na vezi</Znacka>
                  ) : (
                    <Znacka>{u.zadnjiKontakt ? vrijeme.format(u.zadnjiKontakt) : "nije se javio"}</Znacka>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kartica>
      {o.podredene.length > 0 && (
        <Kartica naslov="Vaši klijenti">
          <ul className="flex flex-col gap-1 text-sm">
            {o.podredene.map((p) => (
              <li key={p.id}>
                <Link href={`/portal/mdm/${p.id}`} className="text-primarna hover:underline">
                  {p.naziv}
                </Link>
              </li>
            ))}
          </ul>
        </Kartica>
      )}
    </>
  );
}
