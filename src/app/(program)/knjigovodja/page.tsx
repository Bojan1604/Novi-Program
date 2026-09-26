import Link from "next/link";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { jeMjesec, mjesecOd, sljedeciMjesec } from "@/domain/najam";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { jedan } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { VRSTE_PRODAJE, type VrstaProdaje } from "@/domain/prodaja";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { popisZaKnjigovodju } from "@/services/knjigovodja";
import { RadnjeKnjigovodje } from "./radnje";

export const metadata = { title: "Za knjigovođu · ERP-WMS" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });
const eur = (x: { toFixed(n: number): string }) => `${formatirajIznos(centiIzDecimala(x.toFixed(2)))} €`;

export default async function Knjigovodja({ searchParams }: PageProps<"/knjigovodja">) {
  const k = await pristupStranici("/knjigovodja");
  const sp = await searchParams;
  const prosli = sljedeciMjesec(mjesecOd(danas()), -1);
  const mjesec = jeMjesec(jedan(sp["mjesec"])) ? jedan(sp["mjesec"])! : prosli;
  const [p, firma] = await Promise.all([
    popisZaKnjigovodju(db, k.firmaId, mjesec),
    k.db.firma.findUniqueOrThrow({ where: { id: k.firmaId }, select: { epostaKnjigovodje: true, smtpHost: true } }),
  ]);
  const oznaka = `${mjesec.slice(5)}/${mjesec.slice(0, 4)}`;
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov={`Za knjigovođu · ${oznaka}`}
        opis="Izlazni i ulazni računi mjeseca, troškovi s prilozima i knjige (CSV) u jednom ZIP-u."
        akcije={
          <>
            <GumbVeza href={`/knjigovodja?mjesec=${sljedeciMjesec(mjesec, -1)}`}>← prethodni</GumbVeza>
            <GumbVeza href={`/knjigovodja?mjesec=${sljedeciMjesec(mjesec)}`}>sljedeći →</GumbVeza>
          </>
        }
      />
      <Kartica>
        <RadnjeKnjigovodje
          mjesec={mjesec}
          eposta={firma.epostaKnjigovodje ?? ""}
          smije={imaPravo(k.prava, "knjigovodja", "operativno")}
          smtp={!!firma.smtpHost || process.env["EPOSTA_NACIN"] === "test"}
        />
        {p.predaje.length > 0 && (
          <ul className="mt-4 text-sm text-neutral-600 dark:text-neutral-400" data-testid="predaje">
            {p.predaje.map((x) => (
              <li key={x.id}>
                Predano {vrijeme.format(x.vrijeme)} ({x.nacin === "EPOSTA" ? `e-poštom na ${x.prima}` : x.nacin === "ZIP" ? "ZIP" : "označeno"}) —{" "}
                {x.korisnik}
              </li>
            ))}
          </ul>
        )}
      </Kartica>
      <Kartica naslov={`Izlazni računi (${p.izlazni.length})`}>
        <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="izlazni-knjigovodja">
          {p.izlazni.map((x) => (
            <li key={x.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <Link href={`/racuni/${x.id}`} className="text-primarna hover:underline">
                  {x.broj}
                </Link>{" "}
                · {VRSTE_PRODAJE[x.vrsta as VrstaProdaje]?.naziv} · {datum.format(x.datum)} · {x.partner?.naziv ?? "građanin"}
                {x.novo && p.predaje.length > 0 && (
                  <>
                    {" "}
                    <Znacka boja="zuta">novo</Znacka>
                  </>
                )}
              </span>
              <span>{eur(x.ukupno)}</span>
            </li>
          ))}
        </ul>
        {p.izlazni.length === 0 && <p className="text-sm text-neutral-500">Nema izlaznih računa.</p>}
      </Kartica>
      <Kartica naslov={`Ulazni računi (${p.ulazni.length})`}>
        <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="ulazni-knjigovodja">
          {p.ulazni.map((x) => (
            <li key={x.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <Link href={`/ulazni/${x.id}`} className="text-primarna hover:underline">
                  {x.interni}
                </Link>{" "}
                · {x.broj} · {x.dobavljac?.naziv ?? x.dobavljacTekst} · {datum.format(x.datum)}
                {x.status !== "EVIDENTIRAN" && x.status !== "PRIHVACEN" && ` · ${x.status.toLowerCase()}`}
              </span>
              <span>{eur(x.ukupno)}</span>
            </li>
          ))}
        </ul>
        {p.ulazni.length === 0 && <p className="text-sm text-neutral-500">Nema ulaznih računa.</p>}
      </Kartica>
    </Stranica>
  );
}
