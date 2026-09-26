import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { GumbVeza } from "@/components/ui/gumb";
import { GumbNaljepnice } from "@/components/ui/naljepnice";
import { Obavijest } from "@/components/ui/obavijest";
import { Promjene } from "@/components/ui/promjene";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { formatirajIznos } from "@/domain/novac";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { velicinaZaPrikaz } from "@/domain/prilozi";
import { RADNJE, STANJA, type Stanje, type VrstaRadnje } from "@/domain/stanja-uredaja";
import { pristupStranici } from "@/lib/akcija";
import { karticaUredaja, NAJVISE_DOGADAJA_NA_KARTICI } from "@/queries/uredaji";
import { DodajPriloge, ObrazacUredaja, ObrisiPrilog, ObrisiUredaj } from "./obrasci";

export const metadata = { title: "Uređaj · ERP-WMS" };

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

/** Gdje se otvara dokument iz povijesti (nove vrste dodaju moduli koji ih uvode). */
const PUTANJE_DOKUMENATA: Record<string, string> = { Primka: "/primke", Međuskladišnica: "/skladisni", Izlaz: "/skladisni", Povrat: "/skladisni" };

const BOJE_STANJA: Record<Stanje, "siva" | "zelena" | "crvena" | "plava" | "zuta"> = {
  U_DOLASKU: "plava",
  NA_SKLADISTU: "zelena",
  REZERVIRAN: "zuta",
  PRODAN: "siva",
  U_NAJMU: "plava",
  NA_SERVISU: "zuta",
  OTPISAN: "crvena",
};

function Podatak({ naziv, children }: { naziv: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">{naziv}</dt>
      <dd className="text-sm break-words">{children || "—"}</dd>
    </div>
  );
}

export default async function KarticaUredaja({ params }: PageProps<"/uredaji/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/uredaji");
  const vidiNabavne = imaPosebno(k.prava, "costs");
  const u = await karticaUredaja(k.db, k.firmaId, id, vidiNabavne);
  if (!u) notFound();
  const smijeIspraviti = imaPravo(k.prava, "uredaji", "operativno");
  const smijeBrisati = imaPravo(k.prava, "uredaji", "puno");
  const jamstvoIsteklo = u.jamstvoDo !== null && u.jamstvoDo.toISOString().slice(0, 10) < danas();
  const stanje = u.stanje as Stanje;

  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={<span className="font-mono break-all">{u.serijski}</span>}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            {u.model.proizvodjac.naziv} {u.model.naziv}
            <Znacka boja={BOJE_STANJA[stanje]}>{STANJA[stanje]}</Znacka>
            {u.stanjePrijeServisa && <span className="text-xs">(prije servisa: {STANJA[u.stanjePrijeServisa as Stanje]})</span>}
          </span>
        }
        akcije={
          <>
            <GumbNaljepnice parametri={{ uredaj: u.id }} oznaka="Naljepnica" />
            <GumbVeza href="/uredaji">Natrag</GumbVeza>
          </>
        }
      />

      <Kartica naslov="Podaci">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Podatak naziv="Kategorija">{u.model.kategorija?.naziv}</Podatak>
          <Podatak naziv="Skladište">{u.skladiste?.naziv}</Podatak>
          <Podatak naziv="Kod partnera">
            {u.partner && (
              <>
                <Link href={`/partneri/${u.partner.id}`} className="text-primarna hover:underline">
                  {u.partner.naziv}
                </Link>
                {u.poslovnica && ` · ${u.poslovnica.naziv}`}
              </>
            )}
          </Podatak>
          <Podatak naziv="Stanje robe">{u.stanjeRobe?.naziv}</Podatak>
          <Podatak naziv="Primka">
            {u.primka && (
              <Link href={`/primke/${u.primka.id}`} className="text-primarna hover:underline">
                {u.primka.broj}
              </Link>
            )}
          </Podatak>
          <Podatak naziv="Zaprimljen">{u.nabavniDatum && datum.format(u.nabavniDatum)}</Podatak>
          {vidiNabavne && <Podatak naziv="Nabavna cijena">{u.nabavnaCijena !== null && `${formatirajIznos(u.nabavnaCijena)} €`}</Podatak>}
          <Podatak naziv="Jamstvo do">
            {u.jamstvoDo && (
              <span className={jamstvoIsteklo ? "text-red-700 dark:text-red-400" : ""}>
                {datum.format(u.jamstvoDo)}
                {jamstvoIsteklo && " (isteklo)"}
              </span>
            )}
          </Podatak>
          <Podatak naziv="Procesor">{u.cpu}</Podatak>
          <Podatak naziv="RAM">{u.ram}</Podatak>
          <Podatak naziv="Disk">{u.disk}</Podatak>
          <Podatak naziv="Ekran">{u.ekran}</Podatak>
          <Podatak naziv="Operacijski sustav">{u.os}</Podatak>
        </dl>
        {u.napomena && <p className="mt-3 text-sm whitespace-pre-line">{u.napomena}</p>}
      </Kartica>

      <Kartica naslov={`Povijest (${u.ukupnoDogadaja})`}>
        <ol className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="povijest">
          {u.dogadaji.map((d) => {
            const r = Object.hasOwn(RADNJE, d.radnja) ? RADNJE[d.radnja as VrstaRadnje].naziv : d.radnja;
            const putanja = d.dokumentVrsta ? PUTANJE_DOKUMENATA[d.dokumentVrsta] : undefined;
            return (
              <li key={d.id} className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:gap-4">
                <span className="shrink-0 text-neutral-500 tabular-nums sm:w-36 dark:text-neutral-400">{vrijeme.format(d.vrijeme)}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium first-letter:uppercase">{r}</span>
                  {d.staroStanje !== d.novoStanje && d.novoStanje && (
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {" "}
                      · {d.staroStanje ? `${STANJA[d.staroStanje as Stanje]} → ` : ""}
                      {STANJA[d.novoStanje as Stanje]}
                    </span>
                  )}
                  {d.skladisteOd !== d.skladisteDo && (d.skladisteOd || d.skladisteDo) && (
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {" "}
                      · {d.skladisteOd ?? "—"} → {d.skladisteDo ?? "—"}
                    </span>
                  )}
                  {d.partner && (
                    <>
                      {" · "}
                      <Link href={`/partneri/${d.partner.id}`} className="text-primarna hover:underline">
                        {d.partner.naziv}
                      </Link>
                    </>
                  )}
                  {d.dokumentVrsta && (
                    <>
                      {" · "}
                      {putanja && d.dokumentId ? (
                        <Link href={`${putanja}/${d.dokumentId}`} className="text-primarna hover:underline">
                          {d.dokumentVrsta} {d.dokumentBroj}
                        </Link>
                      ) : (
                        `${d.dokumentVrsta} ${d.dokumentBroj ?? ""}`
                      )}
                    </>
                  )}
                  {d.opis && <div className="text-neutral-600 dark:text-neutral-400">{d.opis}</div>}
                </div>
                <span className="shrink-0 text-neutral-500 dark:text-neutral-400">{d.korisnik}</span>
              </li>
            );
          })}
        </ol>
        {u.ukupnoDogadaja === 0 && <p className="text-sm text-neutral-500 dark:text-neutral-400">Nema zabilježenih događaja.</p>}
        {u.ukupnoDogadaja > NAJVISE_DOGADAJA_NA_KARTICI && (
          <p className="mt-2 text-xs text-neutral-500">Prikazano zadnjih {NAJVISE_DOGADAJA_NA_KARTICI} događaja.</p>
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
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {velicinaZaPrikaz(p.velicina)} · {p.korisnik} · {vrijeme.format(p.stvoreno)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={`/api/prilozi/${p.id}?preuzmi=1`}
                    className="rounded-md px-2.5 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Preuzmi
                  </a>
                  {smijeIspraviti && <ObrisiPrilog uredajId={u.id} prilogId={p.id} naziv={p.naziv} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        {smijeIspraviti ? <DodajPriloge id={u.id} /> : u.prilozi.length === 0 && <p className="text-sm text-neutral-500">Nema priloga.</p>}
      </Kartica>

      {smijeIspraviti && (
        <Kartica naslov="Ispravak podataka">
          <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
            Stanje i lokacija mijenjaju se samo dokumentima (primka, račun, međuskladišnica…), ne ovdje.
          </p>
          <ObrazacUredaja
            id={u.id}
            pocetno={{
              verzija: u.verzija,
              serijski: u.serijski,
              model: { id: u.model.id, naziv: `${u.model.proizvodjac.naziv} ${u.model.naziv}` },
              stanjeRobeId: u.stanjeRobe?.id ?? "",
              jamstvoDo: u.jamstvoDo ? u.jamstvoDo.toISOString().slice(0, 10) : null,
              nabavnaCijena: u.nabavnaCijena,
              cpu: u.cpu ?? "",
              ram: u.ram ?? "",
              disk: u.disk ?? "",
              ekran: u.ekran ?? "",
              os: u.os ?? "",
              napomena: u.napomena ?? "",
            }}
            dopusteno={u.dopusteno}
            zakljucano={u.zakljucano}
            stanjaRobe={u.stanjaRobe}
          />
        </Kartica>
      )}

      {u.ispravci.length > 0 && (
        <Kartica naslov="Ispravci i prilozi — dnevnik">
          <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="ispravci">
            {u.ispravci.map((z) => (
              <li key={z.id} className="py-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>{z.opis}</span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {z.korisnik} · {vrijeme.format(z.vrijeme)}
                  </span>
                </div>
                <Promjene promjene={z.promjene} />
              </li>
            ))}
          </ul>
        </Kartica>
      )}

      {smijeBrisati && (
        <Kartica naslov="Brisanje">
          {u.brisanje ? <Obavijest vrsta="info">{u.brisanje}</Obavijest> : <ObrisiUredaj id={u.id} serijski={u.serijski} />}
        </Kartica>
      )}
    </Stranica>
  );
}
