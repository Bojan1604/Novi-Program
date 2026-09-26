import Link from "next/link";
import { FilterRazdoblja } from "@/components/ui/filtri";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { formatirajIznos } from "@/domain/novac";
import { jedan } from "@/domain/popis";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { marzePoMjesecima, postotakMarze } from "@/queries/marze";

export const metadata = { title: "Marže · ERP-WMS" };
export const dynamic = "force-dynamic";

const MJESECI = ["siječanj", "veljača", "ožujak", "travanj", "svibanj", "lipanj", "srpanj", "kolovoz", "rujan", "listopad", "studeni", "prosinac"];
const eur = (c: number) => `${formatirajIznos(c)} €`;
const posto = (p: number | null) => (p === null ? "—" : `${formatirajIznos(p)} %`);

/** Prihod, nabava prodanih uređaja i marža po mjesecima (pravo „nabavne cijene i marže“). */
export default async function Marze({ searchParams }: PageProps<"/marze">) {
  const k = await pristupStranici("/marze");
  const sp = await searchParams;
  const od = jedan(sp["od"]);
  const doDatuma = jedan(sp["do"]);
  const mjeseci = await marzePoMjesecima(db, k.firmaId, { od, do: doDatuma });
  const u = mjeseci.reduce(
    (a, m) => ({ prihod: a.prihod + m.prihod, nabava: a.nabava + m.nabava, marza: a.marza + m.marza, bez: a.bez + m.bezNabavne }),
    { prihod: 0, nabava: 0, marza: 0, bez: 0 },
  );
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Marže" opis="Prihod bez PDV-a (računi, predujmovi, odobrenja i storna) umanjen za nabavnu cijenu prodanih uređaja." />
      <Kartica>
        <div className="mb-3">
          <FilterRazdoblja />
        </div>
        {u.bez > 0 && (
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-300">
            {u.bez} prodanih uređaja nema nabavnu cijenu — marža je za njih previsoka.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="marze">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                <th className="py-1 pr-2">Mjesec</th>
                <th className="py-1 pr-2 text-right">Dokumenata</th>
                <th className="py-1 pr-2 text-right">Prihod</th>
                <th className="py-1 pr-2 text-right">Nabava</th>
                <th className="py-1 pr-2 text-right">Marža</th>
                <th className="py-1 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {mjeseci.map((m) => {
                const [g, mj] = m.mjesec.split("-");
                const zadnji = new Date(Date.UTC(Number(g), Number(mj), 0)).getUTCDate();
                return (
                  <tr key={m.mjesec} className="border-b border-neutral-100 dark:border-neutral-900">
                    <td className="py-1 pr-2">
                      <Link href={`/racuni?od=${m.mjesec}-01&do=${m.mjesec}-${zadnji}`} className="text-primarna-slova hover:underline">
                        {MJESECI[Number(mj) - 1]} {g}.
                      </Link>
                    </td>
                    <td className="py-1 pr-2 text-right">{m.dokumenata}</td>
                    <td className="py-1 pr-2 text-right">{eur(m.prihod)}</td>
                    <td className="py-1 pr-2 text-right">{eur(m.nabava)}</td>
                    <td className="py-1 pr-2 text-right font-medium">{eur(m.marza)}</td>
                    <td className="py-1 text-right">{posto(postotakMarze(m.marza, m.prihod))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-1 pr-2">Ukupno</td>
                <td />
                <td className="py-1 pr-2 text-right">{eur(u.prihod)}</td>
                <td className="py-1 pr-2 text-right">{eur(u.nabava)}</td>
                <td className="py-1 pr-2 text-right">{eur(u.marza)}</td>
                <td className="py-1 text-right">{posto(postotakMarze(u.marza, u.prihod))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {mjeseci.length === 0 && <p className="mt-3 text-sm text-neutral-500">Nema izdanih računa u razdoblju.</p>}
      </Kartica>
    </Stranica>
  );
}
