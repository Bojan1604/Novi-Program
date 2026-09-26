import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { DodajPriloge, ObrisiPrilog } from "@/components/ui/prilozi";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { jeUuid } from "@/domain/id";
import { formatirajIznos, centiIzDecimala } from "@/domain/novac";
import { imaPravo } from "@/domain/prava";
import { velicinaZaPrikaz } from "@/domain/prilozi";
import { pristupStranici } from "@/lib/akcija";
import { dodajPrilogeUlaznogAkcija, obrisiPrilogUlaznogAkcija } from "../akcije";
import { ObradaERacuna, ObrazacUlaznog, PlacanjeUlaznog, PonistiPlacanje, StornoUlaznog } from "../obrazac";
import { danas } from "@/domain/datum";
import { STATUSI_ULAZNIH } from "@/domain/ulazni";

export const metadata = { title: "Ulazni račun · ERP-WMS" };
export const dynamic = "force-dynamic";

const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });
const dan = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
const eur = (x: { toFixed(n: number): string }) => formatirajIznos(centiIzDecimala(x.toFixed(2)));

export default async function Ulazni({ params }: PageProps<"/ulazni/[id]">) {
  const k = await pristupStranici("/ulazni");
  const { id } = await params;
  if (!jeUuid(id)) notFound();
  const r = await k.db.ulazniRacun.findFirst({
    where: { firmaId: k.firmaId, id },
    include: {
      dobavljac: { select: { id: true, naziv: true } },
      narudzbenica: { select: { id: true, broj: true, primke: { where: { status: "IZDANA" }, select: { id: true, broj: true } } } },
    },
  });
  if (!r) notFound();
  const prilozi = await k.db.prilog.findMany({
    where: { firmaId: k.firmaId, entitet: "UlazniRacun", entitetId: id },
    orderBy: { stvoreno: "desc" },
    select: { id: true, naziv: true, velicina: true, korisnik: true, stvoreno: true },
  });
  const aktivan = r.status === "EVIDENTIRAN" || r.status === "PRIHVACEN";
  const primljen = r.status === "PRIMLJEN";
  const narudzbenice = primljen
    ? await k.db.narudzbenica.findMany({
        where: { firmaId: k.firmaId, ...(r.dobavljacId ? { dobavljacId: r.dobavljacId } : {}), status: { not: "STORNIRANA" } },
        orderBy: { datum: "desc" },
        take: 50,
        select: { id: true, broj: true, primke: { where: { status: "IZDANA" }, select: { id: true, broj: true } } },
      })
    : [];
  const placanja = await k.db.placanjeUlaznog.findMany({ where: { firmaId: k.firmaId, ulazniRacunId: id }, orderBy: { datum: "asc" } });
  const otvoreno = centiIzDecimala(r.ukupno.toFixed(2)) - centiIzDecimala(r.placeno.toFixed(2));
  const smije = imaPravo(k.prava, "nabava", "operativno") && aktivan;
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={`Ulazni račun ${r.interni}`}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            {r.dobavljac ? (
              <Link href={`/partneri/${r.dobavljac.id}`} className="text-primarna-slova hover:underline">
                {r.dobavljac.naziv}
              </Link>
            ) : (
              r.dobavljacTekst
            )}
            <Znacka>{STATUSI_ULAZNIH[r.status] ?? r.status}</Znacka>
            {r.zaRobu && <Znacka boja="plava">račun za robu</Znacka>}
            {r.narudzbenica && (
              <Link href={`/nabava/${r.narudzbenica.id}`} className="text-primarna-slova hover:underline">
                {r.narudzbenica.broj}
              </Link>
            )}
            · ukupno {eur(r.ukupno)} €
          </span>
        }
        akcije={<GumbVeza href="/ulazni">Natrag</GumbVeza>}
      />
      <Kartica>
        <ObrazacUlaznog
          smije={smije}
          p={{
            id: r.id,
            verzija: r.verzija,
            eRacun: r.izvor === "ERACUN",
            broj: r.broj,
            datum: dan(r.datum),
            dospijece: dan(r.dospijece),
            dobavljac: r.dobavljac,
            dobavljacTekst: r.dobavljacTekst ?? "",
            dobavljacOib: r.dobavljacOib ?? "",
            narudzbenica: r.narudzbenica ? { id: r.narudzbenica.id, broj: r.narudzbenica.broj } : null,
            primke: r.narudzbenica?.primke ?? [],
            primkaId: r.primkaId,
            zaRobu: r.zaRobu,
            osnovica: eur(r.osnovica),
            pdv: eur(r.pdv),
            opis: r.opis ?? "",
          }}
        />
        {r.razlogOdbijanja && <p className="mt-3 text-sm text-red-700 dark:text-red-400">Razlog: {r.razlogOdbijanja}</p>}
      </Kartica>
      {primljen && imaPravo(k.prava, "nabava", "operativno") && (
        <Kartica naslov="Prihvat ili odbijanje eRačuna">
          <ObradaERacuna id={r.id} narudzbenice={narudzbenice} />
        </Kartica>
      )}
      {(aktivan || placanja.length > 0) && (
        <Kartica naslov={`Plaćanje · otvoreno ${formatirajIznos(otvoreno)} €`}>
          {placanja.length > 0 && (
            <ul className="mb-3 flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="placanja-ulaznog">
              {placanja.map((p) => (
                <li
                  key={p.id}
                  className={`flex flex-wrap items-center justify-between gap-2 py-1.5 ${p.ponisteno ? "text-neutral-400 line-through" : ""}`}
                >
                  <span>{p.datum.toISOString().slice(0, 10).split("-").reverse().join(".")}.</span>
                  <span className="flex items-center gap-2">
                    {eur(p.iznos)} € · {p.korisnik}
                    {p.ponisteno ? " · poništeno" : imaPravo(k.prava, "nabava", "operativno") && <PonistiPlacanje id={r.id} placanjeId={p.id} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {aktivan && otvoreno > 0 && imaPravo(k.prava, "nabava", "operativno") && (
            <PlacanjeUlaznog id={r.id} otvoreno={formatirajIznos(otvoreno)} danas={danas()} />
          )}
        </Kartica>
      )}
      <Kartica naslov={`Prilozi (${prilozi.length})`}>
        {prilozi.length > 0 && (
          <ul className="mb-3 flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="prilozi">
            {prilozi.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <a href={`/api/prilozi/${p.id}`} target="_blank" rel="noopener" className="break-all text-primarna-slova hover:underline">
                    {p.naziv}
                  </a>
                  <div className="text-xs text-neutral-500">
                    {velicinaZaPrikaz(p.velicina)} · {p.korisnik} · {vrijeme.format(p.stvoreno)}
                  </div>
                </div>
                {imaPravo(k.prava, "nabava", "operativno") && (
                  <ObrisiPrilog akcija={obrisiPrilogUlaznogAkcija.bind(null, r.id, p.id)} naziv={p.naziv} />
                )}
              </li>
            ))}
          </ul>
        )}
        {imaPravo(k.prava, "nabava", "operativno") ? (
          <DodajPriloge akcija={dodajPrilogeUlaznogAkcija.bind(null, r.id)} />
        ) : (
          prilozi.length === 0 && <p className="text-sm text-neutral-500">Nema priloga.</p>
        )}
      </Kartica>
      {r.izvor === "RUCNI" && r.status === "EVIDENTIRAN" && imaPravo(k.prava, "nabava", "puno") && (
        <Kartica naslov="Storno">
          <StornoUlaznog id={r.id} />
        </Kartica>
      )}
    </Stranica>
  );
}
