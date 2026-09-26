import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { danas, dodajDane } from "@/domain/datum";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { imaPravo } from "@/domain/prava";
import { formatirajKolicinu, jeVrstaProdaje, PRETVORBE, VRSTE_PRODAJE, type VrstaProdaje } from "@/domain/prodaja";
import { pristupStranici } from "@/lib/akcija";
import { prodajniDokument } from "@/queries/prodaja";
import { postavkeFirme, statusKupca, uUlaznu } from "@/services/prodaja";
import { IzdajDokument, ObrisiNacrt, Pretvori } from "../radnje";
import { UredjivacDokumenta, type PocetniDokument } from "../uredjivac";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const dan = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const putanja = (vrsta: string) => (vrsta === "RACUN" ? "/racuni" : "/ponude");

export default async function Dokument({ params, searchParams }: PageProps<"/ponude/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/ponude");
  const smije = imaPravo(k.prava, "prodaja", "operativno");
  const firma = await postavkeFirme(k.db as never, k.firmaId);
  const f = { uSustavuPdv: firma.uSustavuPdv, pdvPoNaplacenoj: firma.pdvPoNaplacenoj, rokPlacanjaDana: firma.rokPlacanjaDana };
  const d0 = danas();

  if (id === "nova") {
    const v = (await searchParams)["vrsta"];
    if (!smije || !jeVrstaProdaje(v) || v === "RACUN") notFound();
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
      stavke: [],
    };
    return (
      <Stranica sirina="7xl">
        <NaslovStranice
          naslov={`Nova ${VRSTE_PRODAJE[v].naziv.toLowerCase()}`.replace("Nova predračun", "Novi predračun")}
          akcije={<GumbVeza href="/ponude">Natrag</GumbVeza>}
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
    </Stranica>
  );
}
