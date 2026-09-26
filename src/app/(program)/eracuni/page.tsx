import Link from "next/link";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { stranica, velicina } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import type { StatusERacuna } from "@/lib/eracun/posrednik";
import { STATUSI_ERACUNA } from "@/services/eracun";
import { PosaljiIzvjestaje } from "../racuni/eracun";

export const metadata = { title: "eRačuni · ERP-WMS" };
export const dynamic = "force-dynamic";

const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });
const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const STATUSI_IZVJESTAJA: Record<string, string> = { CEKA: "čeka slanje", SALJE: "šalje se", POSLAN: "poslan", GRESKA: "greška" };

export default async function ERacuni({ searchParams }: PageProps<"/eracuni">) {
  const k = await pristupStranici("/eracuni");
  const sp = await searchParams;
  const str = stranica(sp["stranica"]);
  const vel = velicina(sp["velicina"]);
  const [ukupno, eRacuni, izvjestaji, cekaju] = await Promise.all([
    k.db.eRacun.count({ where: { firmaId: k.firmaId } }),
    k.db.eRacun.findMany({
      where: { firmaId: k.firmaId },
      orderBy: { poslano: "desc" },
      skip: (str - 1) * vel,
      take: vel,
      select: {
        id: true,
        status: true,
        poruka: true,
        poslano: true,
        korisnik: true,
        dokument: { select: { id: true, broj: true, ukupno: true, partner: { select: { naziv: true } } } },
      },
    }),
    k.db.eIzvjestaj.findMany({
      where: { firmaId: k.firmaId },
      orderBy: { stvoreno: "desc" },
      take: 50,
      select: { id: true, vrsta: true, iznos: true, datum: true, status: true, poruka: true, dokument: { select: { id: true, broj: true } } },
    }),
    k.db.eIzvjestaj.count({ where: { firmaId: k.firmaId, status: { in: ["CEKA", "GRESKA"] } } }),
  ]);
  return (
    <Stranica sirina="7xl">
      <NaslovStranice naslov="eRačuni" opis="Izlazni eRačuni poslani preko posrednika i izvještaji o naplati Poreznoj upravi (eIzvještavanje)." />
      <Kartica naslov="Poslani eRačuni">
        {eRacuni.length === 0 ? (
          <p className="text-sm text-neutral-500">Još nije poslan nijedan eRačun. Šalje se s izdanog računa.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="popis-eracuna">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                  <th className="py-1 pr-2">Račun</th>
                  <th className="py-1 pr-2">Kupac</th>
                  <th className="py-1 pr-2 text-right">Iznos</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1">Poslano</th>
                </tr>
              </thead>
              <tbody>
                {eRacuni.map((e) => (
                  <tr key={e.id} className="border-b border-neutral-100 dark:border-neutral-900">
                    <td className="py-1 pr-2">
                      <Link href={`/racuni/${e.dokument.id}`} className="text-primarna hover:underline">
                        {e.dokument.broj}
                      </Link>
                    </td>
                    <td className="py-1 pr-2">{e.dokument.partner?.naziv}</td>
                    <td className="py-1 pr-2 text-right">{formatirajIznos(centiIzDecimala(e.dokument.ukupno.toFixed(2)))} €</td>
                    <td className="py-1 pr-2">
                      <Znacka boja={e.status === "PRIHVACEN" ? "zelena" : ["ODBIJEN", "GRESKA"].includes(e.status) ? "crvena" : "plava"}>
                        {STATUSI_ERACUNA[e.status as StatusERacuna]}
                      </Znacka>
                      {e.poruka && <span className="ml-2 text-xs text-red-700 dark:text-red-400">{e.poruka}</span>}
                    </td>
                    <td className="py-1 text-xs text-neutral-500">
                      {vrijeme.format(e.poslano)} · {e.korisnik}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <Stranicenje putanja="/eracuni" parametri={{}} stranica={str} velicina={vel} ukupno={ukupno} />
        </div>
      </Kartica>
      <Kartica naslov={`eIzvještavanje · čeka ${cekaju}`}>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Naplata eRačuna prijavljuje se Poreznoj upravi (rok: 20. u sljedećem mjesecu). Izvještaji se šalju automatski svakih sat vremena.
        </p>
        {imaPravo(k.prava, "prodaja", "puno") && cekaju > 0 && (
          <div className="mb-3">
            <PosaljiIzvjestaje />
          </div>
        )}
        {izvjestaji.length > 0 && (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="izvjestaji">
            {izvjestaji.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {i.vrsta === "NAPLATA" ? "Naplata" : "Odbijanje"} {formatirajIznos(centiIzDecimala(i.iznos.toFixed(2)))} € ·{" "}
                  <Link href={`/racuni/${i.dokument.id}`} className="text-primarna hover:underline">
                    {i.dokument.broj}
                  </Link>{" "}
                  · {datum.format(i.datum)}
                </span>
                <span className="text-xs text-neutral-500">
                  {STATUSI_IZVJESTAJA[i.status] ?? i.status}
                  {i.poruka && ` — ${i.poruka}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kartica>
    </Stranica>
  );
}
