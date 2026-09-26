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
