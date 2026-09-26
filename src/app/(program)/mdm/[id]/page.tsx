import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { jeUuid } from "@/domain/id";
import { naVezi, PLATFORME, VRSTE_ORGANIZACIJA, type Platforma, type VrstaOrganizacije } from "@/domain/mdm";
import { imaPravo } from "@/domain/prava";
import { velicinaZaPrikaz } from "@/domain/prilozi";
import { pristupStranici } from "@/lib/akcija";
import { NoviKod, ObrazacOrganizacije } from "../obrasci";
import { DatotekeOrganizacije, Dodjele } from "../upravljanje";

export const metadata = { title: "MDM organizacija · ERP-WMS" };
export const dynamic = "force-dynamic";

const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

export default async function Organizacija({ params }: PageProps<"/mdm/[id]">) {
  const k = await pristupStranici("/mdm");
  const { id } = await params;
  if (!jeUuid(id)) notFound();
  const o = await k.db.mdmOrganizacija.findFirst({
    where: { firmaId: k.firmaId, id },
    include: {
      nadredena: { select: { id: true, naziv: true } },
      podredene: { select: { id: true, naziv: true }, orderBy: { naziv: "asc" } },
      uredaji: {
        orderBy: { serijski: "asc" },
        take: 500,
        select: { id: true, serijski: true, naziv: true, platforma: true, zadnjiKontakt: true, stanje: true },
      },
    },
  });
  if (!o) notFound();
  const smije = imaPravo(k.prava, "mdm", "operativno");
  const [distributeri, partneri] = smije
    ? await Promise.all([
        k.db.mdmOrganizacija.findMany({
          where: { firmaId: k.firmaId, vrsta: "DISTRIBUTER", nadredenaId: null },
          orderBy: { naziv: "asc" },
          select: { id: true, naziv: true },
        }),
        k.db.partner.findMany({
          where: { firmaId: k.firmaId, aktivan: true },
          orderBy: { naziv: "asc" },
          select: { id: true, naziv: true },
          take: 2000,
        }),
      ])
    : [[], []];
  const sada = new Date();
  const [dodjele, aplikacije, datoteke] = await Promise.all([
    k.db.mdmDodjela.findMany({ where: { firmaId: k.firmaId, organizacijaId: o.id } }),
    k.db.mdmAplikacija.findMany({
      where: { firmaId: k.firmaId },
      orderBy: { verzijaKod: "desc" },
      select: { naziv: true, paket: true, platforma: true, verzija: true },
    }),
    k.db.mdmDatoteka.findMany({
      where: { firmaId: k.firmaId, organizacijaId: o.id },
      orderBy: { stvoreno: "desc" },
      select: { id: true, naziv: true, putanja: true, velicina: true },
    }),
  ]);
  // po paketu i platformi najnovija verzija (aplikacije su poredane od najnovije)
  const najnovije = new Map<string, (typeof aplikacije)[number]>();
  for (const a of aplikacije) if (!najnovije.has(`${a.paket}|${a.platforma}`)) najnovije.set(`${a.paket}|${a.platforma}`, a);
  const opis = (a: (typeof aplikacije)[number]) => `${a.naziv} (${a.paket}) · ${PLATFORME[a.platforma as Platforma]} · ${a.verzija}`;
  const dostupne = [...najnovije.values()].map((a) => ({ paket: a.paket, platforma: a.platforma, opis: opis(a) }));
  const dodijeljene = dodjele.map((d) => {
    const a = najnovije.get(`${d.paket}|${d.platforma}`);
    return { paket: d.paket, platforma: d.platforma, opis: a ? opis(a) : `${d.paket} · ${d.platforma}` };
  });
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={o.naziv}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Znacka>{VRSTE_ORGANIZACIJA[o.vrsta as VrstaOrganizacije]}</Znacka>
            {o.nadredena && (
              <span>
                pod{" "}
                <Link href={`/mdm/${o.nadredena.id}`} className="text-primarna hover:underline">
                  {o.nadredena.naziv}
                </Link>
              </span>
            )}
          </span>
        }
        akcije={<GumbVeza href="/mdm">Natrag</GumbVeza>}
      />
      <Kartica naslov="Upis uređaja">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR s poslužitelja (PNG), bez optimizacije */}
          <img
            src={`/api/mdm/organizacije/${o.id}/qr`}
            alt={`QR za upis u ${o.naziv}`}
            width={180}
            height={180}
            className="rounded border border-neutral-200"
          />
          <div className="flex min-w-0 flex-col gap-2 text-sm">
            <span className="text-neutral-500">Kod upisa (agent: upišite ga ili skenirajte QR)</span>
            <code className="text-xl font-semibold tracking-wider" data-testid="kod-upisa">
              {o.kodUpisa}
            </code>
            {smije && <NoviKod id={o.id} />}
          </div>
        </div>
      </Kartica>
      <Kartica naslov={`Uređaji (${o.uredaji.length})`}>
        {o.uredaji.length === 0 ? (
          <p className="text-sm text-neutral-500">Još nema upisanih uređaja.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="mdm-uredaji">
            {o.uredaji.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/mdm/uredaji/${u.id}`} className="break-all text-primarna hover:underline">
                  {u.serijski}
                  {u.naziv ? ` · ${u.naziv}` : ""}
                </Link>
                <span className="flex flex-wrap gap-1">
                  <Znacka>{PLATFORME[u.platforma as Platforma]}</Znacka>
                  {u.stanje === "BLOKIRAN" ? (
                    <Znacka boja="crvena">blokiran</Znacka>
                  ) : naVezi(u.zadnjiKontakt, sada) ? (
                    <Znacka boja="zelena">na vezi</Znacka>
                  ) : (
                    <Znacka>{u.zadnjiKontakt ? `javio se ${vrijeme.format(u.zadnjiKontakt)}` : "nije se javio"}</Znacka>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kartica>
      <Kartica naslov="Aplikacije (i za organizacije ispod)">
        {smije ? (
          <Dodjele organizacijaId={o.id} dodijeljene={dodijeljene} dostupne={dostupne} />
        ) : (
          <p className="text-sm">{dodijeljene.map((d) => d.opis).join(", ") || "—"}</p>
        )}
      </Kartica>
      <Kartica naslov="Datoteke za uređaje">
        {smije ? (
          <DatotekeOrganizacije
            organizacijaId={o.id}
            datoteke={datoteke.map((d) => ({ id: d.id, naziv: d.naziv, putanja: d.putanja, velicina: velicinaZaPrikaz(d.velicina) }))}
          />
        ) : (
          <p className="text-sm">{datoteke.map((d) => d.naziv).join(", ") || "—"}</p>
        )}
      </Kartica>
      {o.podredene.length > 0 && (
        <Kartica naslov="Klijenti distributera">
          <ul className="flex flex-col gap-1 text-sm">
            {o.podredene.map((p) => (
              <li key={p.id}>
                <Link href={`/mdm/${p.id}`} className="text-primarna hover:underline">
                  {p.naziv}
                </Link>
              </li>
            ))}
          </ul>
        </Kartica>
      )}
      {smije && (
        <Kartica naslov="Podaci organizacije">
          <ObrazacOrganizacije
            id={o.id}
            pocetno={{ naziv: o.naziv, vrsta: o.vrsta, nadredenaId: o.nadredenaId ?? "", partnerId: o.partnerId ?? "", aktivna: o.aktivna }}
            distributeri={distributeri}
            partneri={partneri}
          />
        </Kartica>
      )}
    </Stranica>
  );
}
