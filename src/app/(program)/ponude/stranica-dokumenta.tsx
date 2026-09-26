import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { danas, dodajDane } from "@/domain/datum";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { imaPravo } from "@/domain/prava";
import { formatirajKolicinu, jeVrstaProdaje, PRETVORBE, VRSTE_PRODAJE, type VrstaProdaje } from "@/domain/prodaja";
import type { Kontekst } from "@/lib/akcija";
import { prodajniDokument } from "@/queries/prodaja";
import { NACINI_PLACANJA, postavkeFirme, statusKupca, uUlaznu } from "@/services/prodaja";
import { NAZIVI_STATUSA, stanjePlacanja } from "@/domain/uplate";
import { PonistiUplatu, UnosUplate } from "../racuni/placanje";
import { IzdajDokument, ObrisiNacrt, Pretvori } from "./radnje";
import { UredjivacDokumenta, type PocetniDokument } from "./uredjivac";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const dan = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const putanja = (vrsta: string) => (vrsta === "RACUN" ? "/racuni" : "/ponude");

export async function StranicaDokumenta({ id, vrstaNovog, k }: { id: string; vrstaNovog: string | string[] | undefined; k: Kontekst }) {
  const smije = imaPravo(k.prava, "prodaja", "operativno");
  const firma = await postavkeFirme(k.db as never, k.firmaId);
  const f = { uSustavuPdv: firma.uSustavuPdv, pdvPoNaplacenoj: firma.pdvPoNaplacenoj, rokPlacanjaDana: firma.rokPlacanjaDana };
  const d0 = danas();

  if (id === "nova") {
    const v = vrstaNovog;
    if (!smije || !jeVrstaProdaje(v)) notFound();
    const pocetno: PocetniDokument = {
      id: null,
      vrsta: v,
      verzija: 0,
      partner: null,
      statusKupca: "DOMACI",
      poslovnice: [],
      poslovnicaId: null,
      datum: d0,
      vrijediDo: v === "PONUDA" ? dodajDane(d0, 15) : null,
      dospijece: v === "PONUDA" ? null : dodajDane(d0, firma.rokPlacanjaDana),
      popust: 0,
      napomena: "",
      nacinPlacanja: "T",
      stavke: [],
    };
    return (
      <Stranica sirina="7xl">
        <NaslovStranice
          naslov={v === "PONUDA" ? "Nova ponuda" : v === "RACUN" ? "Novi račun" : "Novi predračun"}
          akcije={<GumbVeza href={putanja(v)}>Natrag</GumbVeza>}
        />
        <Kartica>
          <UredjivacDokumenta pocetno={pocetno} firma={f} danas={d0} />
        </Kartica>
      </Stranica>
    );
  }

  const d = await prodajniDokument(k.db, k.firmaId, id);
  if (!d) notFound();
  const vrsta = d.vrsta as VrstaProdaje;
  const naziv = VRSTE_PRODAJE[vrsta]?.naziv ?? d.vrsta;
  const nacrt = d.status === "NACRT";
  const veze = (
    <span className="inline-flex flex-wrap items-center gap-2">
      {d.partner && (
        <Link href={`/partneri/${d.partner.id}`} className="text-primarna hover:underline">
          {d.partner.naziv}
        </Link>
      )}
      {nacrt ? <Znacka>nacrt</Znacka> : d.status === "STORNIRAN" ? <Znacka boja="crvena">storniran</Znacka> : null}
      {d.izvor && (
        <Link href={`${putanja(d.izvor.vrsta)}/${d.izvor.id}`} className="text-primarna hover:underline">
          iz: {VRSTE_PRODAJE[d.izvor.vrsta as VrstaProdaje]?.naziv} {d.izvor.broj ?? "(nacrt)"}
        </Link>
      )}
      {d.izvedeni.map((x) => (
        <Link key={x.id} href={`${putanja(x.vrsta)}/${x.id}`} className="text-primarna hover:underline">
          → {VRSTE_PRODAJE[x.vrsta as VrstaProdaje]?.naziv} {x.broj ?? "(nacrt)"}
        </Link>
      ))}
    </span>
  );

  if (nacrt && smije) {
    const pocetno: PocetniDokument = {
      id: d.id,
      vrsta,
      verzija: d.verzija,
      partner: d.partner ? { id: d.partner.id, naziv: d.partner.naziv } : null,
      statusKupca: statusKupca(d.partner),
      poslovnice: d.poslovnice,
      poslovnicaId: d.poslovnicaId,
      datum: dan(d.datum)!,
      vrijediDo: dan(d.vrijediDo),
      dospijece: dan(d.dospijece),
      popust: d.popust,
      napomena: d.napomena ?? "",
      nacinPlacanja: d.nacinPlacanja,
      stavke: d.stavke.map((s) => ({ ...uUlaznu(s), opis: s.opis, kpd: s.kpd })),
    };
    return (
      <Stranica sirina="7xl">
        <NaslovStranice
          naslov={`${naziv} (nacrt)`}
          opis={veze}
          akcije={
            <>
              <IzdajDokument id={d.id} naziv={naziv.toLowerCase()} />
              <ObrisiNacrt id={d.id} />
              <GumbVeza href={putanja(d.vrsta)}>Natrag</GumbVeza>
            </>
          }
        />
        <Kartica>
          <UredjivacDokumenta pocetno={pocetno} firma={f} danas={d0} />
        </Kartica>
      </Stranica>
    );
  }

  const snimka = d.snimka as { napomene?: string[] } | null;
  const placanje = stanjePlacanja(
    centiIzDecimala(d.ukupno.toFixed(2)),
    d.uplate.map((u) => ({ iznos: centiIzDecimala(u.iznos.toFixed(2)), ponistena: u.ponistena })),
  );
  const smijePonistiti = imaPravo(k.prava, "prodaja", "puno");
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov={`${naziv} ${d.broj ?? "(nacrt)"}`}
        opis={veze}
        akcije={
          <>
            {smije &&
              !nacrt &&
              PRETVORBE[vrsta]?.map((u) => <Pretvori key={u} id={d.id} u={u} oznaka={`Napravi ${VRSTE_PRODAJE[u].naziv.toLowerCase()}`} />)}
            <GumbVeza href={putanja(d.vrsta)}>Natrag</GumbVeza>
          </>
        }
      />
      <Kartica>
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-neutral-500">Datum</dt>
            <dd>{datum.format(d.datum)}</dd>
          </div>
          {d.vrijediDo && (
            <div>
              <dt className="text-xs text-neutral-500">Vrijedi do</dt>
              <dd>{datum.format(d.vrijediDo)}</dd>
            </div>
          )}
          {d.dospijece && (
            <div>
              <dt className="text-xs text-neutral-500">Dospijeće</dt>
              <dd>{datum.format(d.dospijece)}</dd>
            </div>
          )}
          {d.poslovnica && (
            <div>
              <dt className="text-xs text-neutral-500">Poslovnica</dt>
              <dd>{d.poslovnica.naziv}</dd>
            </div>
          )}
        </dl>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="stavke-dokumenta">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Naziv</th>
                <th className="py-1 pr-2 text-right">Kol.</th>
                <th className="py-1 pr-2 text-right">Cijena</th>
                <th className="py-1 pr-2 text-right">Popust</th>
                <th className="py-1 pr-2 text-right">PDV</th>
                <th className="py-1 text-right">Iznos</th>
              </tr>
            </thead>
            <tbody>
              {d.stavke.map((s, i) => (
                <tr key={s.id} className="border-b border-neutral-100 align-top dark:border-neutral-900">
                  <td className="py-1 pr-2">{i + 1}</td>
                  <td className="py-1 pr-2">
                    {s.naziv}
                    {s.namjena === "NAJAM" && <span className="text-xs text-neutral-500"> (najam)</span>}
                    {s.opis && <div className="text-xs text-neutral-500">{s.opis}</div>}
                  </td>
                  <td className="py-1 pr-2 text-right whitespace-nowrap">
                    {formatirajKolicinu(s.kolicina)} {s.jedinica}
                  </td>
                  <td className="py-1 pr-2 text-right whitespace-nowrap">{formatirajIznos(centiIzDecimala(s.cijena.toFixed(2)))}</td>
                  <td className="py-1 pr-2 text-right">{s.popust ? `${formatirajIznos(s.popust)} %` : ""}</td>
                  <td className="py-1 pr-2 text-right">{s.kategorija === "HR" ? `${s.stopa / 100} %` : "—"}</td>
                  <td className="py-1 text-right whitespace-nowrap">{formatirajIznos(centiIzDecimala(s.iznos.toFixed(2)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-3 ml-auto grid max-w-xs grid-cols-2 gap-1 text-sm tabular-nums" data-testid="zbrojevi">
          {d.popust > 0 && (
            <>
              <dt>Popust na dokument</dt>
              <dd className="text-right">{formatirajIznos(d.popust)} %</dd>
            </>
          )}
          <dt>Osnovica</dt>
          <dd className="text-right">{formatirajIznos(centiIzDecimala(d.osnovica.toFixed(2)))} €</dd>
          <dt>PDV</dt>
          <dd className="text-right">{formatirajIznos(centiIzDecimala(d.pdv.toFixed(2)))} €</dd>
          <dt className="font-semibold">Ukupno</dt>
          <dd className="text-right font-semibold">{formatirajIznos(centiIzDecimala(d.ukupno.toFixed(2)))} €</dd>
        </dl>
        {snimka?.napomene && snimka.napomene.length > 0 && (
          <ul className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
            {snimka.napomene.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {d.napomena && <p className="mt-3 text-sm whitespace-pre-line">{d.napomena}</p>}
        <p className="mt-3 text-xs text-neutral-500">Izradio {d.korisnik}</p>
      </Kartica>
      {d.vrsta === "RACUN" && !nacrt && (
        <Kartica naslov={`Plaćanje · ${NAZIVI_STATUSA[placanje.status]}`}>
          <dl className="mb-3 grid grid-cols-3 gap-3 text-sm tabular-nums" data-testid="stanje-placanja">
            <div>
              <dt className="text-xs text-neutral-500">Plaćeno</dt>
              <dd>{formatirajIznos(placanje.placeno)} €</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Otvoreno</dt>
              <dd className={placanje.otvoreno ? "font-semibold" : ""}>{formatirajIznos(placanje.otvoreno)} €</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Za povrat kupcu</dt>
              <dd className={placanje.zaPovrat ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>{formatirajIznos(placanje.zaPovrat)} €</dd>
            </div>
          </dl>
          {d.uplate.length > 0 && (
            <ul className="mb-3 flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="uplate">
              {d.uplate.map((u) => {
                const iznos = centiIzDecimala(u.iznos.toFixed(2));
                return (
                  <li
                    key={u.id}
                    className={`flex flex-wrap items-center justify-between gap-2 py-1.5 ${u.ponistena ? "text-neutral-400 line-through" : ""}`}
                  >
                    <span>
                      {datum.format(u.datum)} · {iznos < 0 ? "povrat kupcu" : "uplata"} {formatirajIznos(Math.abs(iznos))} € ·{" "}
                      {NACINI_PLACANJA[u.nacin] ?? u.nacin}
                      {u.opis && ` · ${u.opis}`}
                      <span className="text-xs text-neutral-500"> · {u.korisnik}</span>
                      {u.ponistena && <span className="text-xs no-underline"> (poništeno: {u.razlogPonistenja})</span>}
                    </span>
                    {!u.ponistena && smijePonistiti && <PonistiUplatu dokumentId={d.id} uplataId={u.id} iznos={iznos} />}
                  </li>
                );
              })}
            </ul>
          )}
          {smije && (placanje.otvoreno > 0 || placanje.zaPovrat > 0 || d.uplate.length === 0) && (
            <UnosUplate
              key={`${placanje.otvoreno}-${placanje.zaPovrat}-${d.uplate.length}`}
              dokumentId={d.id}
              otvoreno={placanje.otvoreno}
              zaPovrat={placanje.zaPovrat}
              danas={d0}
            />
          )}
        </Kartica>
      )}
    </Stranica>
  );
}
