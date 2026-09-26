import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { Tablica } from "@/components/ui/tablica";
import { danas } from "@/domain/datum";
import { imaPravo } from "@/domain/prava";
import { jeVrsta, VRSTE_DOKUMENATA, type VrstaDokumenta } from "@/domain/skladisni-dokumenti";
import { STANJA, type Stanje } from "@/domain/stanja-uredaja";
import { pristupStranici } from "@/lib/akcija";
import { skladisniDokument, skladistaZaDokument } from "@/queries/skladisni-dokumenti";
import { NoviDokument } from "../novi-dokument";
import { Odluka } from "../odluka";
import { ZnackaStatusa } from "../znacka";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });

export default async function SkladisniDokument({ params, searchParams }: PageProps<"/skladisni/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/skladisni");

  if (id === "nova") {
    const v = (await searchParams)["vrsta"];
    if (!imaPravo(k.prava, "uredaji", "operativno") || !jeVrsta(v)) notFound();
    const skladista = await skladistaZaDokument(k.db, k.firmaId);
    return (
      <Stranica sirina="5xl">
        <NaslovStranice naslov={`Novi dokument: ${VRSTE_DOKUMENATA[v].naziv.toLowerCase()}`} akcije={<GumbVeza href="/skladisni">Natrag</GumbVeza>} />
        <Kartica>
          <NoviDokument vrsta={v} danas={danas()} skladista={skladista} />
        </Kartica>
      </Stranica>
    );
  }

  const d = await skladisniDokument(k.db, k.firmaId, id);
  if (!d) notFound();
  const o = d.odobrenje;
  const smijeOdluciti = o?.status === "CEKA" && imaPravo(k.prava, "uredaji", "puno") && o.podnioId !== k.korisnikId;
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={`${VRSTE_DOKUMENATA[d.vrsta as VrstaDokumenta]?.naziv ?? d.vrsta} ${d.broj}`}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            {datum.format(d.datum)}
            {d.skladisteIz && <> · iz: {d.skladisteIz.naziv}</>}
            {d.skladisteU && <> · u: {d.skladisteU.naziv}</>}
            {d.partner && (
              <>
                {" · "}
                <Link href={`/partneri/${d.partner.id}`} className="text-primarna hover:underline">
                  {d.partner.naziv}
                </Link>
              </>
            )}
            {d.razlog && <> · {d.razlog}</>}
            <ZnackaStatusa status={d.status} />
          </span>
        }
        akcije={<GumbVeza href="/skladisni">Natrag</GumbVeza>}
      />
      {o && (
        <Kartica naslov="Odobrenje">
          {o.status === "CEKA" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Zatražio {o.podnio}, {vrijeme.format(o.stvoreno)}. Uređaji se ne mijenjaju dok drugi korisnik ne odobri.
              </p>
              {smijeOdluciti ? (
                <Odluka odobrenjeId={o.id} />
              ) : o.podnioId === k.korisnikId ? (
                <Obavijest vrsta="info">Vlastiti zahtjev ne možete odobriti — mora ga odobriti drugi korisnik.</Obavijest>
              ) : null}
            </div>
          ) : (
            <p className="text-sm">
              {o.status === "ODOBRENO" ? "Odobrio" : "Odbio"} {o.odlucio}
              {o.odluceno && `, ${vrijeme.format(o.odluceno)}`}
              {o.razlog && ` — ${o.razlog}`} (zatražio {o.podnio})
            </p>
          )}
        </Kartica>
      )}
      <Kartica naslov={`Uređaji (${d.brojUredaja})`}>
        <Tablica
          testId="uredaji-dokumenta"
          putanja={`/skladisni/${d.id}`}
          parametri={{}}
          redovi={d.stavke}
          kljucReda={(s) => s.uredaj.id}
          veza={(s) => `/uredaji/${s.uredaj.id}`}
          stupci={[
            { kljuc: "serijski", naslov: "Serijski", prikaz: (s) => <span className="font-mono">{s.uredaj.serijski}</span> },
            { kljuc: "model", naslov: "Model", prikaz: (s) => `${s.uredaj.model.proizvodjac.naziv} ${s.uredaj.model.naziv}` },
            { kljuc: "prije", naslov: "Stanje na dokumentu", prikaz: (s) => STANJA[s.staroStanje as Stanje] },
            { kljuc: "sada", naslov: "Stanje sada", prikaz: (s) => STANJA[s.uredaj.stanje as Stanje] },
          ]}
        />
      </Kartica>
      {d.napomena && <Kartica naslov="Napomena">{d.napomena}</Kartica>}
      <p className="text-xs text-neutral-500">Izdao {d.korisnik}</p>
    </Stranica>
  );
}
