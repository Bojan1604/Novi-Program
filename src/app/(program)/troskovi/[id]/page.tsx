import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { DodajPriloge, ObrisiPrilog } from "@/components/ui/prilozi";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { jeUuid } from "@/domain/id";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { imaPravo } from "@/domain/prava";
import { velicinaZaPrikaz } from "@/domain/prilozi";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { kategorijeTroskova } from "@/services/troskovi";
import { dodajPrilogeTroskaAkcija, obrisiPrilogTroskaAkcija } from "../akcije";
import { ObrazacTroska, PlacenoTroska } from "../obrasci";

export const metadata = { title: "Trošak · ERP-WMS" };
export const dynamic = "force-dynamic";

const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

export default async function Trosak({ params }: PageProps<"/troskovi/[id]">) {
  const k = await pristupStranici("/troskovi");
  const { id } = await params;
  if (!jeUuid(id)) notFound();
  const t = await k.db.trosak.findFirst({ where: { firmaId: k.firmaId, id }, include: { kategorija: { select: { naziv: true } } } });
  if (!t) notFound();
  const [kategorije, prilozi] = await Promise.all([
    kategorijeTroskova(db, k.firmaId),
    k.db.prilog.findMany({
      where: { firmaId: k.firmaId, entitet: "Trosak", entitetId: id },
      orderBy: { stvoreno: "desc" },
      select: { id: true, naziv: true, velicina: true, korisnik: true, stvoreno: true },
    }),
  ]);
  const smije = imaPravo(k.prava, "troskovi", "operativno");
  const eur = (x: { toFixed(n: number): string }) => formatirajIznos(centiIzDecimala(x.toFixed(2)));
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={t.opis}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            {t.kategorija.naziv} · {eur(t.iznos)} € {t.placeno ? <Znacka boja="zelena">plaćeno</Znacka> : <Znacka>neplaćeno</Znacka>}
            {t.ponavljajuciId && <Znacka>ponavljajući</Znacka>}
          </span>
        }
        akcije={<GumbVeza href="/troskovi">Natrag</GumbVeza>}
      />
      {smije && (
        <Kartica>
          <ObrazacTroska
            id={t.id}
            kategorije={kategorije}
            p={{
              datum: t.datum.toISOString().slice(0, 10),
              kategorijaId: t.kategorijaId,
              opis: t.opis,
              iznos: eur(t.iznos),
              pdv: eur(t.pdv),
              placeno: t.placeno,
            }}
          />
          <div className="mt-4">
            <PlacenoTroska id={t.id} placeno={t.placeno} smijeObrisati={imaPravo(k.prava, "troskovi", "puno")} />
          </div>
        </Kartica>
      )}
      <Kartica naslov={`Prilozi (${prilozi.length})`}>
        {prilozi.length > 0 && (
          <ul className="mb-3 flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="prilozi">
            {prilozi.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <a href={`/api/prilozi/${p.id}`} target="_blank" rel="noopener" className="break-all text-primarna hover:underline">
                    {p.naziv}
                  </a>
                  <div className="text-xs text-neutral-500">
                    {velicinaZaPrikaz(p.velicina)} · {p.korisnik} · {vrijeme.format(p.stvoreno)}
                  </div>
                </div>
                {smije && <ObrisiPrilog akcija={obrisiPrilogTroskaAkcija.bind(null, t.id, p.id)} naziv={p.naziv} />}
              </li>
            ))}
          </ul>
        )}
        {smije ? (
          <DodajPriloge akcija={dodajPrilogeTroskaAkcija.bind(null, t.id)} />
        ) : (
          prilozi.length === 0 && <p className="text-sm text-neutral-500">Nema priloga.</p>
        )}
      </Kartica>
    </Stranica>
  );
}
