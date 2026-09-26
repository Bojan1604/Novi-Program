import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza, klaseGumba } from "@/components/ui/gumb";
import { DodajPriloge, ObrisiPrilog } from "@/components/ui/prilozi";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { imaPravo } from "@/domain/prava";
import { velicinaZaPrikaz } from "@/domain/prilozi";
import { jeOtvoren, provjeriBrisanje, STATUSI_SERVISA, uredajKlijenta, type StatusServisa } from "@/domain/servis";
import { STANJA, type Stanje } from "@/domain/stanja-uredaja";
import { pristupStranici } from "@/lib/akcija";
import { dodajPrilogeAkcija, obrisiPrilogAkcija } from "../akcije";
import { bojaStatusa } from "../boje";
import { Dijagnoza, IzdajZamjenu, JavnostPriloga, ObrisiNalog, StatusNaloga, VratiZamjenu, ZaprimiPrijavu, Zavrsetak } from "../obrasci";

export const metadata = { title: "Servisni nalog · ERP-WMS" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

function Redak({ oznaka, children }: { oznaka: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-neutral-500 sm:w-40">{oznaka}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function Nalog({ params }: PageProps<"/servis/[id]">) {
  const k = await pristupStranici("/servis");
  const { id } = await params;
  if (!jeUuid(id)) notFound();
  const n = await k.db.servisniNalog.findFirst({
    where: { firmaId: k.firmaId, id },
    include: {
      uredaj: { select: { id: true, serijski: true, stanje: true, model: { select: { naziv: true } } } },
      zamjenski: { select: { id: true, serijski: true, stanje: true } },
      partner: { select: { id: true, naziv: true } },
      ugovor: { select: { id: true, broj: true } },
      dogadaji: { orderBy: { vrijeme: "desc" } },
    },
  });
  if (!n) notFound();
  const [prilozi, skladista] = await Promise.all([
    k.db.prilog.findMany({
      where: { firmaId: k.firmaId, entitet: "ServisniNalog", entitetId: id },
      orderBy: { stvoreno: "desc" },
      select: { id: true, naziv: true, velicina: true, korisnik: true, stvoreno: true, javno: true },
    }),
    k.db.skladiste.findMany({
      where: { firmaId: k.firmaId, aktivan: true },
      orderBy: [{ zadano: "desc" }, { naziv: "asc" }],
      select: { id: true, naziv: true },
    }),
  ]);
  const otvoren = jeOtvoren(n.status);
  const smije = imaPravo(k.prava, "servis", "operativno");
  const puno = imaPravo(k.prava, "servis", "puno");
  const aktivnaZamjena = !!n.zamjenskiUredajId && !n.zamjenaDo;
  const stanjePrije = n.stanjePrije as Stanje;
  const dan = danas();
  const prijavljen = n.status === "PRIJAVLJEN";
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={`Servisni nalog ${n.broj}`}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Znacka boja={bojaStatusa(n.status)}>{STATUSI_SERVISA[n.status as StatusServisa]}</Znacka>
            {n.izvor === "PORTAL" && <Znacka>prijava s portala</Znacka>}
            {aktivnaZamjena && <Znacka boja="plava">klijent ima zamjenski</Znacka>}
          </span>
        }
        akcije={
          <>
            <a href={`/api/servis/${n.id}/pdf`} target="_blank" rel="noopener" className={klaseGumba()}>
              Otpremnica (PDF)
            </a>
            <GumbVeza href="/servis">Natrag</GumbVeza>
          </>
        }
      />
      <Kartica>
        <dl className="flex flex-col gap-2 text-sm">
          <Redak oznaka="Uređaj">
            <Link href={`/uredaji/${n.uredaj.id}`} className="text-primarna hover:underline">
              {n.uredaj.serijski}
            </Link>{" "}
            · {n.uredaj.model.naziv} · sada: {STANJA[n.uredaj.stanje as Stanje]}
          </Redak>
          <Redak oznaka="Prije servisa">{STANJA[stanjePrije]}</Redak>
          <Redak oznaka="Klijent">
            {n.partner ? (
              <Link href={`/partneri/${n.partner.id}`} className="text-primarna hover:underline">
                {n.partner.naziv}
              </Link>
            ) : (
              "— (naš uređaj)"
            )}
          </Redak>
          {n.ugovor && (
            <Redak oznaka="Ugovor o najmu">
              <Link href={`/najam/${n.ugovor.id}`} className="text-primarna hover:underline">
                {n.ugovor.broj}
              </Link>
            </Redak>
          )}
          <Redak oznaka="Zaprimljen">
            {datum.format(n.datum)} · {n.korisnik}
          </Redak>
          {n.zatvoren && <Redak oznaka="Zatvoren">{datum.format(n.zatvoren)}</Redak>}
          {n.kontakt && <Redak oznaka="Kontakt">{n.kontakt}</Redak>}
          <Redak oznaka="Opis kvara">
            <span className="whitespace-pre-wrap">{n.opisKvara}</span>
          </Redak>
          {n.zamjenski && (
            <Redak oznaka="Zamjenski uređaj">
              <Link href={`/uredaji/${n.zamjenski.id}`} className="text-primarna hover:underline">
                {n.zamjenski.serijski}
              </Link>{" "}
              · od {n.zamjenaOd ? datum.format(n.zamjenaOd) : "—"}
              {n.zamjenaDo ? ` do ${datum.format(n.zamjenaDo)}` : " (kod klijenta)"}
            </Redak>
          )}
        </dl>
      </Kartica>
      {prijavljen && smije && (
        <Kartica naslov="Zaprimanje">
          <ZaprimiPrijavu id={n.id} danas={dan} skladista={skladista} />
        </Kartica>
      )}
      {otvoren && !prijavljen && smije && (
        <Kartica naslov="Status">
          <StatusNaloga key={n.verzija} id={n.id} verzija={n.verzija} status={n.status} />
        </Kartica>
      )}
      <Kartica naslov="Dijagnoza i napomena">
        {smije ? (
          <Dijagnoza key={n.verzija} id={n.id} verzija={n.verzija} dijagnoza={n.dijagnoza ?? ""} napomena={n.napomenaKlijentu ?? ""} />
        ) : (
          <dl className="flex flex-col gap-2 text-sm">
            <Redak oznaka="Dijagnoza">{n.dijagnoza ?? "—"}</Redak>
            <Redak oznaka="Napomena klijentu">{n.napomenaKlijentu ?? "—"}</Redak>
          </dl>
        )}
      </Kartica>
      {otvoren && !prijavljen && smije && uredajKlijenta(stanjePrije) && (
        <Kartica naslov="Zamjenski uređaj">
          {aktivnaZamjena ? <VratiZamjenu id={n.id} danas={dan} skladista={skladista} /> : <IzdajZamjenu id={n.id} danas={dan} />}
        </Kartica>
      )}
      {otvoren && smije && (
        <Kartica naslov="Završetak">
          <Zavrsetak
            id={n.id}
            danas={dan}
            skladista={skladista}
            trebaSkladiste={aktivnaZamjena}
            smijeOtpis={puno && stanjePrije !== "PRODAN"}
            prijavljen={prijavljen}
          />
          {puno && provjeriBrisanje({ status: n.status, imaoZamjenu: n.imaoZamjenu }) === null && (
            <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <ObrisiNalog id={n.id} />
            </div>
          )}
        </Kartica>
      )}
      <Kartica naslov="Tijek">
        <ol className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="tijek-servisa">
          {n.dogadaji.map((d) => (
            <li key={d.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-3">
              <span className="min-w-0 break-words whitespace-pre-wrap">
                {d.opis} {!d.javno && <Znacka>interno</Znacka>}
              </span>
              <span className="shrink-0 text-xs text-neutral-500">
                {vrijeme.format(d.vrijeme)} · {d.korisnik}
              </span>
            </li>
          ))}
        </ol>
      </Kartica>
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
                    {velicinaZaPrikaz(p.velicina)} · {p.korisnik} · {vrijeme.format(p.stvoreno)}{" "}
                    {p.javno ? <Znacka boja="zelena">vidi klijent</Znacka> : <Znacka>interno</Znacka>}
                  </div>
                </div>
                {smije && (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <JavnostPriloga id={n.id} prilogId={p.id} javno={p.javno} />
                    <ObrisiPrilog akcija={obrisiPrilogAkcija.bind(null, n.id, p.id)} naziv={p.naziv} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {smije ? (
          <DodajPriloge akcija={dodajPrilogeAkcija.bind(null, n.id)} />
        ) : (
          prilozi.length === 0 && <p className="text-sm text-neutral-500">Nema priloga.</p>
        )}
      </Kartica>
    </Stranica>
  );
}
