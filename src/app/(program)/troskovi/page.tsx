import Link from "next/link";
import { FilterRazdoblja } from "@/components/ui/filtri";
import { StupcaniGrafikon } from "@/components/ui/grafikon";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { danas, jeDatum } from "@/domain/datum";
import { mjesecOd } from "@/domain/najam";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { jedan, stranica } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { zbrojeviTroskova } from "@/domain/troskovi";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { kategorijeTroskova, pregledTroskova, stvoriPonavljajuce } from "@/services/troskovi";
import { NovaKategorija, NoviPonavljajuci, ObrazacTroska, Zaustavi } from "./obrasci";

export const metadata = { title: "Troškovi · ERP-WMS" };
export const dynamic = "force-dynamic";

const PO_STRANICI = 50;
const IZVORI: Record<string, string> = {
  RUCNI: "",
  PONAVLJAJUCI: "ponavljajući",
  ULAZNI: "ulazni račun",
  NARUDZBENICA: "roba (narudžbenica)",
  PRIMKA: "primka",
};
const fmt = (x: string) => x.split("-").reverse().join(".") + ".";

export default async function Troskovi({ searchParams }: PageProps<"/troskovi">) {
  const k = await pristupStranici("/troskovi");
  const sp = await searchParams;
  const d0 = danas();
  const od = jeDatum(jedan(sp["od"])) ? jedan(sp["od"])! : `${d0.slice(0, 4)}-01-01`;
  const doD = jeDatum(jedan(sp["do"])) ? jedan(sp["do"])! : d0;
  // dospjeli ponavljajući troškovi (i bez pozadinskog posla, npr. odmah nakon upisa)
  await stvoriPonavljajuce(db, k.firmaId);
  const [redovi, kategorije, ponavljajuci] = await Promise.all([
    pregledTroskova(db, k.firmaId, k.prava, od, doD),
    kategorijeTroskova(db, k.firmaId),
    k.db.ponavljajuciTrosak.findMany({
      where: { firmaId: k.firmaId, aktivan: true },
      include: { kategorija: { select: { naziv: true } } },
      orderBy: { opis: "asc" },
    }),
  ]);
  const z = zbrojeviTroskova(redovi, mjesecOd(od), mjesecOd(doD) < mjesecOd(od) ? mjesecOd(od) : mjesecOd(doD));
  const str = stranica(sp["stranica"]);
  const ukupno = redovi.reduce((a, r) => a + r.iznos, 0);
  const smije = imaPravo(k.prava, "troskovi", "operativno");
  return (
    <Stranica sirina="7xl">
      <NaslovStranice naslov="Troškovi" opis={`${fmt(od)} – ${fmt(doD)} · ukupno ${formatirajIznos(ukupno)} € bez PDV-a`} />
      <Kartica>
        <div className="mb-3">
          <FilterRazdoblja />
        </div>
        <StupcaniGrafikon
          oznake={z.mjeseci.map((m) => `${m.slice(5)}/${m.slice(2, 4)}`)}
          serije={z.kategorije}
          vrijednosti={z.vrijednosti}
          opis="Troškovi po mjesecima i kategorijama"
          format={(n) => `${formatirajIznos(n)} €`}
        />
      </Kartica>
      {smije && (
        <Kartica naslov="Novi trošak">
          <ObrazacTroska
            id={null}
            kategorije={kategorije}
            p={{ datum: d0, kategorijaId: kategorije[0]?.id ?? "", opis: "", iznos: "", pdv: "", placeno: false }}
          />
        </Kartica>
      )}
      <Kartica naslov={`Troškovi (${redovi.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="troskovi">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                <th className="py-1 pr-2">Datum</th>
                <th className="py-1 pr-2">Kategorija</th>
                <th className="py-1 pr-2">Opis</th>
                <th className="py-1 pr-2 text-right">Iznos</th>
                <th className="py-1">Plaćeno</th>
              </tr>
            </thead>
            <tbody>
              {redovi.slice((str - 1) * PO_STRANICI, str * PO_STRANICI).map((r) => (
                <tr key={`${r.izvor}-${r.id}`} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-1 pr-2 whitespace-nowrap">{fmt(r.datum)}</td>
                  <td className="py-1 pr-2">{r.kategorija}</td>
                  <td className="py-1 pr-2">
                    {r.veza ? (
                      <Link href={r.veza} className="text-primarna hover:underline">
                        {r.opis}
                      </Link>
                    ) : (
                      r.opis
                    )}
                    {IZVORI[r.izvor] && <span className="ml-1 text-xs text-neutral-500">({IZVORI[r.izvor]})</span>}
                  </td>
                  <td className="py-1 pr-2 text-right whitespace-nowrap">{formatirajIznos(r.iznos)} €</td>
                  <td className="py-1">{r.placeno ? <Znacka boja="zelena">da</Znacka> : <Znacka>ne</Znacka>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {redovi.length === 0 && <p className="text-sm text-neutral-500">Nema troškova u razdoblju.</p>}
        <div className="mt-3">
          <Stranicenje putanja="/troskovi" parametri={{ od, do: doD }} stranica={str} velicina={PO_STRANICI} ukupno={redovi.length} />
        </div>
      </Kartica>
      <Kartica naslov="Ponavljajući troškovi">
        {ponavljajuci.length > 0 && (
          <ul className="mb-4 flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="ponavljajuci">
            {ponavljajuci.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  {p.opis} · {p.kategorija.naziv} · {formatirajIznos(centiIzDecimala(p.iznos.toFixed(2)))} € svakog {p.dan}. u mjesecu
                </span>
                {smije && <Zaustavi id={p.id} />}
              </li>
            ))}
          </ul>
        )}
        {smije && <NoviPonavljajuci kategorije={kategorije} mjesec={mjesecOd(d0)} />}
        {smije && (
          <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <NovaKategorija />
          </div>
        )}
      </Kartica>
    </Stranica>
  );
}
