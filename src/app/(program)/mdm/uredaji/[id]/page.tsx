import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { jeUuid } from "@/domain/id";
import { naVezi, PLATFORME, type Platforma } from "@/domain/mdm";
import { instaliraneIzIzvjestaja, STATUSI_NAREDBI, VRSTE_NAREDBI, type StatusNaredbe, type VrstaNaredbe } from "@/domain/mdm-upravljanje";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { PonovniUpis, StanjeMdmUredaja } from "../../obrasci";
import { NaredbaUredaju, OtkaziNaredbu } from "../../upravljanje";

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
  const [naredbe, snimke, zapisi, aplikacije] = await Promise.all([
    k.db.mdmNaredba.findMany({ where: { firmaId: k.firmaId, mdmUredajId: u.id }, orderBy: { stvoreno: "desc" }, take: 30 }),
    k.db.mdmSnimka.findMany({
      where: { firmaId: k.firmaId, mdmUredajId: u.id },
      orderBy: { vrijeme: "desc" },
      take: 3,
      select: { id: true, vrijeme: true },
    }),
    k.db.mdmZapis.findMany({ where: { firmaId: k.firmaId, mdmUredajId: u.id }, orderBy: { vrijeme: "desc" }, take: 100 }),
    k.db.mdmAplikacija.findMany({
      where: { firmaId: k.firmaId, platforma: u.platforma },
      orderBy: [{ naziv: "asc" }, { verzijaKod: "desc" }],
      select: { id: true, naziv: true, verzija: true },
    }),
  ]);
  const instalirane = [...instaliraneIzIzvjestaja(u.izvjestaj)].sort(([a], [b]) => a.localeCompare(b));
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
      {imaPravo(k.prava, "mdm", "operativno") && u.stanje === "AKTIVAN" && (
        <Kartica naslov="Naredbe">
          <NaredbaUredaju
            id={u.id}
            vrste={(Object.keys(VRSTE_NAREDBI) as VrstaNaredbe[]).filter(
              (v) =>
                (VRSTE_NAREDBI[v].platforme as readonly string[]).includes(u.platforma) &&
                (!VRSTE_NAREDBI[v].puno || imaPravo(k.prava, "mdm", "puno")),
            )}
            aplikacije={aplikacije.map((a) => ({ id: a.id, naziv: `${a.naziv} ${a.verzija}` }))}
          />
        </Kartica>
      )}
      <Kartica naslov="Povijest naredbi">
        {naredbe.length === 0 ? (
          <p className="text-sm text-neutral-500">Nema naredbi.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="mdm-naredbe">
            {naredbe.map((n) => (
              <li key={n.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 break-words">
                  {VRSTE_NAREDBI[n.vrsta as VrstaNaredbe]?.naziv ?? n.vrsta}
                  {n.rezultat ? <span className="text-neutral-500"> — {n.rezultat}</span> : null}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <Znacka boja={n.status === "IZVRSENA" ? "zelena" : n.status === "GRESKA" ? "crvena" : n.status === "OTKAZANA" ? "siva" : "zuta"}>
                    {STATUSI_NAREDBI[n.status as StatusNaredbe]}
                  </Znacka>
                  {vrijeme.format(n.stvoreno)} · {n.korisnik}
                  {(n.status === "CEKA" || n.status === "POSLANA") && imaPravo(k.prava, "mdm", "operativno") && (
                    <OtkaziNaredbu uredajId={u.id} id={n.id} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kartica>
      {instalirane.length > 0 && (
        <Kartica naslov="Instalirane aplikacije (javlja agent)">
          <ul className="flex flex-col gap-1 text-sm" data-testid="mdm-instalirane">
            {instalirane.map(([paket, kod]) => (
              <li key={paket} className="break-all">
                {paket} <span className="text-neutral-500">(broj verzije {kod})</span>
              </li>
            ))}
          </ul>
        </Kartica>
      )}
      {snimke.length > 0 && (
        <Kartica naslov="Snimke zaslona">
          <div className="flex flex-col gap-3">
            {snimke.map((s) => (
              <figure key={s.id} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- snimka s poslužitelja */}
                <img
                  src={`/api/mdm/snimke/${s.id}`}
                  alt={`Snimka zaslona ${vrijeme.format(s.vrijeme)}`}
                  className="max-w-full rounded border border-neutral-200"
                />
                <figcaption className="text-xs text-neutral-500">{vrijeme.format(s.vrijeme)}</figcaption>
              </figure>
            ))}
          </div>
        </Kartica>
      )}
      <Kartica naslov="Zapisnik agenta">
        {zapisi.length === 0 ? (
          <p className="text-sm text-neutral-500">Agent još nije poslao zapisnik.</p>
        ) : (
          <ol className="flex flex-col gap-1 font-mono text-xs" data-testid="mdm-zapisnik">
            {zapisi.map((z) => (
              <li
                key={z.id}
                className={`break-words ${z.razina === "GRESKA" ? "text-red-700 dark:text-red-400" : z.razina === "UPOZORENJE" ? "text-amber-700" : ""}`}
              >
                {vrijeme.format(z.vrijeme)} [{z.razina}] {z.poruka}
              </li>
            ))}
          </ol>
        )}
      </Kartica>
      {imaPravo(k.prava, "mdm", "operativno") && (
        <Kartica naslov="Pristup">
          <div className="flex flex-col gap-4">
            <StanjeMdmUredaja id={u.id} blokiran={u.stanje === "BLOKIRAN"} />
            <PonovniUpis id={u.id} dopusten={u.ponovniUpis} />
          </div>
        </Kartica>
      )}
    </Stranica>
  );
}
