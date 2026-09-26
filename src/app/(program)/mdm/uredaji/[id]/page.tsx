import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { jeUuid } from "@/domain/id";
import { naVezi, PLATFORME, type Platforma } from "@/domain/mdm";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { StanjeMdmUredaja } from "../../obrasci";

export const metadata = { title: "MDM uređaj · ERP-WMS" };
export const dynamic = "force-dynamic";

const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

export default async function MdmUredaj({ params }: PageProps<"/mdm/uredaji/[id]">) {
  const k = await pristupStranici("/mdm");
  const { id } = await params;
  if (!jeUuid(id)) notFound();
  const u = await k.db.mdmUredaj.findFirst({
    where: { firmaId: k.firmaId, id },
    include: { organizacija: { select: { id: true, naziv: true } }, uredaj: { select: { id: true, serijski: true } } },
  });
  if (!u) notFound();
  const izvjestaj = Object.entries((u.izvjestaj ?? {}) as Record<string, unknown>).filter(([, v]) => v === null || typeof v !== "object");
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={u.serijski}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Znacka>{PLATFORME[u.platforma as Platforma]}</Znacka>
            {u.stanje === "BLOKIRAN" ? (
              <Znacka boja="crvena">blokiran</Znacka>
            ) : (
              naVezi(u.zadnjiKontakt, new Date()) && <Znacka boja="zelena">na vezi</Znacka>
            )}
            <Link href={`/mdm/${u.organizacija.id}`} className="text-primarna hover:underline">
              {u.organizacija.naziv}
            </Link>
          </span>
        }
        akcije={<GumbVeza href={`/mdm/${u.organizacija.id}`}>Natrag</GumbVeza>}
      />
      <Kartica>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ["Naziv", u.naziv],
            ["Model", u.model],
            ["Sustav", u.osVerzija],
            ["Agent", u.verzijaAgenta],
            ["Upisan", vrijeme.format(u.upisan)],
            ["Zadnji kontakt", u.zadnjiKontakt ? vrijeme.format(u.zadnjiKontakt) : "—"],
          ].map(([a, b]) => (
            <div key={a} className="min-w-0">
              <dt className="text-neutral-500">{a}</dt>
              <dd className="break-words">{b ?? "—"}</dd>
            </div>
          ))}
          {u.uredaj && (
            <div>
              <dt className="text-neutral-500">Kartica uređaja</dt>
              <dd>
                <Link href={`/uredaji/${u.uredaj.id}`} className="text-primarna hover:underline">
                  {u.uredaj.serijski}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Kartica>
      {izvjestaj.length > 0 && (
        <Kartica naslov="Zadnje stanje (javlja agent)">
          <dl className="grid gap-2 text-sm sm:grid-cols-2" data-testid="mdm-izvjestaj">
            {izvjestaj.map(([a, b]) => (
              <div key={a} className="min-w-0">
                <dt className="text-neutral-500">{a}</dt>
                <dd className="break-words">{String(b)}</dd>
              </div>
            ))}
          </dl>
        </Kartica>
      )}
      {imaPravo(k.prava, "mdm", "operativno") && (
        <Kartica naslov="Pristup">
          <StanjeMdmUredaja id={u.id} blokiran={u.stanje === "BLOKIRAN"} />
        </Kartica>
      )}
    </Stranica>
  );
}
