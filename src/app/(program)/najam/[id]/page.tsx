import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { DodajPriloge, ObrisiPrilog } from "@/components/ui/prilozi";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { imaPravo } from "@/domain/prava";
import { velicinaZaPrikaz } from "@/domain/prilozi";
import { statusUgovora, STATUSI_UGOVORA } from "@/domain/ugovor-najma";
import { pristupStranici } from "@/lib/akcija";
import { ugovorNajma } from "@/queries/najam";
import { dodajPrilogeUgovoraAkcija, obrisiPrilogUgovoraAkcija } from "../akcije";
import { ObrazacUgovora, OtkazUgovora } from "../obrazac";
import { DodajUredaje, UredajiUgovora, type RedakPlana } from "../uredaji";
import { cijenaUMjesecu, mjesecOd, prvaNeizdana, rateUredaja, sljedeciMjesec } from "@/domain/najam";
import { formatirajIznos } from "@/domain/novac";
import { podaciZaNaplatu } from "@/services/najam";
import { db } from "@/lib/db";

export const metadata = { title: "Ugovor o najmu · ERP-WMS" };
export const dynamic = "force-dynamic";

const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });
const dan = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

export default async function Ugovor({ params }: PageProps<"/najam/[id]">) {
  const k = await pristupStranici("/najam");
  const { id } = await params;
  const u = await ugovorNajma(k.db, k.firmaId, id);
  if (!u) notFound();
  const d0 = danas();
  const s = statusUgovora({ od: dan(u.od)!, do: dan(u.do), otkazan: dan(u.otkazan) }, d0);
  const smije = imaPravo(k.prava, "najam", "operativno");
  // uređaji: prethodni, tekući i sljedeći mjesec (fakturirani s iznosom s računa)
  const n = await podaciZaNaplatu(db, k.firmaId, u.id);
  const tekuci = mjesecOd(d0);
  const mjeseci = [sljedeciMjesec(tekuci, -1), tekuci, sljedeciMjesec(tekuci)];
  const redovi: RedakPlana[] = n.planovi.map((p, i) => {
    const plan = n.motor[i]!;
    const rate = new Map(rateUredaja(n.uvjeti, plan, n.fakturirano, mjeseci[2]!).map((r) => [r.mjesec, r]));
    return {
      id: p.id,
      uredajId: p.uredaj.id,
      serijski: p.uredaj.serijski,
      naziv: `${p.uredaj.model.proizvodjac.naziv} ${p.uredaj.model.naziv}`,
      od: dan(p.od)!,
      do: dan(p.do),
      izvor: p.izvor,
      cijena: formatirajIznos(cijenaUMjesecu(plan.cijene, tekuci)),
      rate: mjeseci.map((m) => {
        const r = rate.get(m);
        return [m, r ? (r.izvor === "PAUZA" ? "pauza" : formatirajIznos(r.iznos)) : "—", r?.izvor === "FAKTURIRANO"];
      }),
    };
  });
  const prva = n.motor.map((p) => prvaNeizdana(n.uvjeti, p, n.fakturirano)).sort()[0] ?? tekuci;
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={`Ugovor ${u.broj}`}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={`/partneri/${u.partner.id}`} className="text-primarna hover:underline">
              {u.partner.naziv}
            </Link>
            <Znacka boja={s === "AKTIVAN" ? "zelena" : s === "OTKAZAN" ? "crvena" : "siva"}>{STATUSI_UGOVORA[s]}</Znacka>
            {u.redni === null && <Znacka>ručni broj</Znacka>}
          </span>
        }
        akcije={<GumbVeza href="/najam">Natrag</GumbVeza>}
      />
      <Kartica naslov="Uvjeti">
        <ObrazacUgovora
          smije={smije}
          p={{
            id: u.id,
            verzija: u.verzija,
            broj: u.broj,
            partner: u.partner,
            poslovnicaId: u.poslovnicaId,
            poslovnice: u.poslovnice,
            od: dan(u.od)!,
            do: dan(u.do) ?? "",
            rokPlacanjaDana: u.rokPlacanjaDana,
            nacinPlacanja: u.nacinPlacanja,
            uvjeti: u.uvjeti ?? "",
            napomenaRacuna: u.napomenaRacuna ?? "",
          }}
        />
      </Kartica>
      <Kartica naslov={`Uređaji (${redovi.length})`}>
        <UredajiUgovora ugovorId={u.id} redovi={redovi} mjeseci={mjeseci} smije={smije} prvaNeizdana={prva > tekuci ? prva : tekuci} />
        {smije && (
          <details className="mt-4 rounded-md border border-neutral-200 p-3 dark:border-neutral-800" open={redovi.length === 0}>
            <summary className="cursor-pointer text-sm font-medium">Dodaj uređaje</summary>
            <div className="mt-3">
              <DodajUredaje ugovorId={u.id} od={d0 > dan(u.od)! ? d0 : dan(u.od)!} />
            </div>
          </details>
        )}
      </Kartica>
      <Kartica naslov={`Prilozi (${u.prilozi.length})`}>
        {u.prilozi.length > 0 && (
          <ul className="mb-3 flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="prilozi">
            {u.prilozi.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <a href={`/api/prilozi/${p.id}`} target="_blank" rel="noopener" className="break-all text-primarna hover:underline">
                    {p.naziv}
                  </a>
                  <div className="text-xs text-neutral-500">
                    {velicinaZaPrikaz(p.velicina)} · {p.korisnik} · {vrijeme.format(p.stvoreno)}
                  </div>
                </div>
                {smije && <ObrisiPrilog akcija={obrisiPrilogUgovoraAkcija.bind(null, u.id, p.id)} naziv={p.naziv} />}
              </li>
            ))}
          </ul>
        )}
        {smije ? (
          <DodajPriloge akcija={dodajPrilogeUgovoraAkcija.bind(null, u.id)} />
        ) : (
          u.prilozi.length === 0 && <p className="text-sm text-neutral-500">Nema priloga.</p>
        )}
      </Kartica>
      {imaPravo(k.prava, "najam", "puno") && (
        <Kartica naslov="Otkaz">
          <OtkazUgovora id={u.id} otkazan={dan(u.otkazan)} razlog={u.razlogOtkaza} danas={d0} />
        </Kartica>
      )}
    </Stranica>
  );
}
