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
import { DodajUredaje, PauzaUgovora, PovratUredaja, UredajiUgovora, type RedakPlana } from "../uredaji";
import { cijenaUMjesecu, mjesecOd, prvaNeizdana, rateUredaja, sljedeciMjesec, zaIzdati } from "@/domain/najam";
import { AutomatskoIzdavanje, IzdajRate, IzvanPrograma } from "../rate";
import { formatirajIznos } from "@/domain/novac";
import { podaciZaNaplatu, visakUgovora } from "@/services/najam";
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
  // rate za izdati do tekućeg mjeseca i izdane rate (s računa ili izvan programa)
  const zaIzdavanje = zaIzdati(n.uvjeti, n.motor, n.fakturirano, tekuci);
  const serijskiPlana = new Map(n.planovi.map((p) => [p.id, p.uredaj.serijski]));
  const izdane = n.planovi
    .flatMap((p) =>
      p.rate.map((r) => ({
        planId: p.id,
        serijski: p.uredaj.serijski,
        mjesec: r.mjesec.toISOString().slice(0, 7),
        iznos: r.iznos,
        dokumentId: r.dokumentId,
      })),
    )
    .sort((a, b) => b.mjesec.localeCompare(a.mjesec) || a.serijski.localeCompare(b.serijski));
  const racuni = new Map(
    (
      await k.db.prodajniDokument.findMany({
        where: { firmaId: k.firmaId, id: { in: [...new Set(izdane.map((x) => x.dokumentId).filter((x): x is string => !!x))] } },
        select: { id: true, broj: true },
      })
    ).map((x) => [x.id, x.broj]),
  );
  const visakZaOdobrenje = visakUgovora(n);
  const aktivni = n.planovi.filter((p) => !p.do).map((p) => ({ planId: p.id, serijski: p.uredaj.serijski }));
  const skladista = aktivni.length
    ? await k.db.skladiste.findMany({
        where: { firmaId: k.firmaId, aktivan: true },
        orderBy: [{ zadano: "desc" }, { naziv: "asc" }],
        select: { id: true, naziv: true },
      })
    : [];
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
        akcije={
          <>
            <GumbVeza href={`/najam/${u.id}/raspored`}>Raspored</GumbVeza>
            <GumbVeza href="/najam">Natrag</GumbVeza>
          </>
        }
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
        {smije && <DodajUredaje ugovorId={u.id} od={d0 > dan(u.od)! ? d0 : dan(u.od)!} otvoreno={redovi.length === 0} />}
      </Kartica>
      {visakZaOdobrenje.length > 0 && (
        <Kartica naslov="Višak za odobrenje">
          <p className="mb-2 text-sm">
            Nakon povrata, otkaza ili pauze neke izdane rate su veće nego što bi sada trebale biti. Program ne mijenja izdane račune — za razliku
            napravite odobrenje na računu.
          </p>
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="visak">
            {visakZaOdobrenje.map((v) => (
              <li key={`${v.serijski}-${v.mjesec}`} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  <span className="font-mono">{v.serijski}</span> · {v.mjesec.slice(5)}/{v.mjesec.slice(0, 4)} · izdano{" "}
                  {formatirajIznos(v.fakturirano)} €, treba {formatirajIznos(v.sada)} €
                </span>
                <span className="flex items-center gap-2 font-medium">
                  višak {formatirajIznos(v.razlika)} €
                  {v.dokumentId && (
                    <Link href={`/racuni/${v.dokumentId}`} className="font-normal text-primarna hover:underline">
                      račun {racuni.get(v.dokumentId)}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-medium">Ukupno višak: {formatirajIznos(visakZaOdobrenje.reduce((a, v) => a + v.razlika, 0))} € bez PDV-a</p>
        </Kartica>
      )}
      {smije && aktivni.length > 0 && (
        <Kartica naslov="Povrat uređaja i pauza">
          <PovratUredaja ugovorId={u.id} uredaji={aktivni} skladista={skladista} danas={d0} />
          <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <PauzaUgovora ugovorId={u.id} mjesec={prva > tekuci ? prva : tekuci} />
          </div>
        </Kartica>
      )}
      <Kartica naslov={`Rate za izdati (${zaIzdavanje.length})`}>
        {zaIzdavanje.length > 0 ? (
          <>
            <ul className="mb-3 flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="rate-za-izdati">
              {zaIzdavanje.map((r) => (
                <li key={`${r.uredajId}-${r.mjesec}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>
                    <span className="font-mono">{serijskiPlana.get(r.uredajId)}</span> · {r.mjesec.slice(5)}/{r.mjesec.slice(0, 4)}
                    {r.dana < r.danaUMjesecu && (
                      <span className="text-xs text-neutral-500">
                        {" "}
                        ({r.dana}/{r.danaUMjesecu} dana)
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {formatirajIznos(r.iznos)} €{smije && <IzvanPrograma ugovorId={u.id} planId={r.uredajId} mjesec={r.mjesec} izvan />}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mb-3 text-sm font-medium">Ukupno bez PDV-a: {formatirajIznos(zaIzdavanje.reduce((a, r) => a + r.iznos, 0))} €</p>
          </>
        ) : (
          <p className="mb-3 text-sm text-neutral-500">Sve rate do tekućeg mjeseca su izdane.</p>
        )}
        {smije && n.planovi.length > 0 && <IzdajRate ugovorId={u.id} mjesec={tekuci} />}
        {smije && (
          <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <AutomatskoIzdavanje ugovorId={u.id} ukljuceno={u.automatski} od={dan(u.automatskiOd)} greska={u.automatskiGreska} />
          </div>
        )}
        {izdane.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">Izdane rate ({izdane.length})</summary>
            <ul className="mt-2 flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="izdane-rate">
              {izdane.slice(0, 500).map((r) => (
                <li key={`${r.planId}-${r.mjesec}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>
                    <span className="font-mono">{r.serijski}</span> · {r.mjesec.slice(5)}/{r.mjesec.slice(0, 4)} ·{" "}
                    {formatirajIznos(Math.round(Number(r.iznos) * 100))} €
                  </span>
                  {r.dokumentId ? (
                    <Link href={`/racuni/${r.dokumentId}`} className="text-primarna hover:underline">
                      {racuni.get(r.dokumentId)}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 text-xs text-neutral-500">
                      izdano izvan programa
                      {smije && <IzvanPrograma ugovorId={u.id} planId={r.planId} mjesec={r.mjesec} izvan={false} />}
                    </span>
                  )}
                </li>
              ))}
            </ul>
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
