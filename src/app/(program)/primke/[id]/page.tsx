import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Tablica } from "@/components/ui/tablica";
import { danas } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { formatirajIznos } from "@/domain/novac";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { STANJA, type Stanje } from "@/domain/stanja-uredaja";
import { pristupStranici } from "@/lib/akcija";
import { opcijeZaprimanja, primka } from "@/queries/primke";
import { NovaPrimka } from "../nova-primka";
import { StornoPrimke } from "../storno";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function Primka({ params }: PageProps<"/primke/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/primke");
  const vidiNabavne = imaPosebno(k.prava, "costs");

  if (id === "nova") {
    if (!imaPravo(k.prava, "uredaji", "operativno")) notFound();
    const o = await opcijeZaprimanja(k.db, k.firmaId);
    return (
      <Stranica sirina="7xl">
        <NaslovStranice naslov="Nova primka" akcije={<GumbVeza href="/primke">Natrag</GumbVeza>} />
        {o.skladista.length === 0 ? (
          <Obavijest vrsta="upozorenje">Nema aktivnog skladišta. Dodajte ga u Šifrarnicima.</Obavijest>
        ) : (
          <Kartica>
            <NovaPrimka danas={danas()} skladista={o.skladista} stanja={o.stanja} vidiNabavne={vidiNabavne} />
          </Kartica>
        )}
      </Stranica>
    );
  }

  if (!jeUuid(id)) notFound();
  const p = await primka(k.db, k.firmaId, id, vidiNabavne);
  if (!p) notFound();
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov={`Primka ${p.broj}`}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            {datum.format(p.datum)} · {p.skladiste.naziv}
            {p.dobavljac && (
              <>
                {" · "}
                <Link href={`/partneri/${p.dobavljac.id}`} className="text-primarna hover:underline">
                  {p.dobavljac.naziv}
                </Link>
              </>
            )}
            {p.dokumentDobavljaca && <> · dok. {p.dokumentDobavljaca}</>}
            {p.status === "STORNIRANA" && <Znacka boja="crvena">stornirana</Znacka>}
            {p.knjiziUTroskove && <Znacka>knjiži u troškove</Znacka>}
          </span>
        }
        akcije={<GumbVeza href="/primke">Natrag</GumbVeza>}
      />
      <Kartica naslov={`Uređaji (${p.brojUredaja})`}>
        {p.status === "STORNIRANA" ? (
          <Obavijest vrsta="info">Primka je stornirana — uređaji s nje uklonjeni su iz programa.</Obavijest>
        ) : (
          <Tablica
            testId="uredaji-primke"
            putanja={`/primke/${p.id}`}
            parametri={{}}
            redovi={p.uredaji}
            kljucReda={(u) => u.id}
            veza={(u) => `/uredaji/${u.id}`}
            stupci={[
              { kljuc: "serijski", naslov: "Serijski", prikaz: (u) => <span className="font-mono">{u.serijski}</span> },
              { kljuc: "model", naslov: "Model", prikaz: (u) => `${u.model.proizvodjac.naziv} ${u.model.naziv}` },
              { kljuc: "spec", naslov: "Specifikacija", prikaz: (u) => [u.cpu, u.ram, u.os].filter(Boolean).join(" · ") },
              { kljuc: "stanje", naslov: "Stanje", prikaz: (u) => STANJA[u.stanje as Stanje] },
              ...(vidiNabavne
                ? [
                    {
                      kljuc: "nabavna",
                      naslov: "Nabavna cijena",
                      desno: true,
                      prikaz: (u: (typeof p.uredaji)[number]) => (u.nabavnaCijena === null ? "" : `${formatirajIznos(u.nabavnaCijena)} €`),
                    },
                  ]
                : []),
            ]}
            podnozje={vidiNabavne && p.nabavnaVrijednost !== null ? ["Ukupno", "", "", "", `${formatirajIznos(p.nabavnaVrijednost)} €`] : undefined}
          />
        )}
      </Kartica>
      {p.napomena && <Kartica naslov="Napomena">{p.napomena}</Kartica>}
      {p.status === "IZDANA" && imaPravo(k.prava, "uredaji", "puno") && (
        <Kartica naslov="Storno">
          <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
            Moguć samo dok se nijedan uređaj s primke nije prodao, iznajmio ili premjestio.
          </p>
          <StornoPrimke id={p.id} />
        </Kartica>
      )}
    </Stranica>
  );
}
