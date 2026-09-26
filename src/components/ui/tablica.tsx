import Link from "next/link";
import type { ReactNode } from "react";
import { sljedeciSmjer, urlPopisa, type ParametriUrl, type Sortiranje } from "@/domain/popis";

export type Stupac<R> = {
  kljuc: string;
  naslov: string;
  /** ključ sortiranja (iz popisa dopuštenih u upitu); bez njega stupac se ne sortira */
  sortira?: string;
  desno?: boolean;
  /** na mobitelu: "naslov" = glavni redak kartice, "skriveno" = ne prikazuje se */
  mobitel?: "naslov" | "skriveno";
  prikaz: (red: R) => ReactNode;
};

/**
 * Tablica popisa. Na računalu tablica, na mobitelu kartice (isti HTML, CSS mijenja raspored).
 * Sortiranje su veze (radi u bazi, bez JavaScripta); stranice i zbrojevi dolaze iz upita.
 */
export function Tablica<R>({
  stupci,
  redovi,
  kljucReda,
  veza,
  sort,
  putanja,
  parametri,
  prazno = "Nema podataka.",
  podnozje,
  testId,
}: {
  stupci: Stupac<R>[];
  redovi: R[];
  kljucReda: (r: R) => string;
  veza?: (r: R) => string;
  sort?: Sortiranje<string>;
  putanja: string;
  parametri: ParametriUrl;
  prazno?: string;
  /** redak zbrojeva (iz baze) */
  podnozje?: ReactNode[];
  testId?: string;
}) {
  return (
    <div className="max-md:-mx-1">
      <table className="tbl" data-testid={testId}>
        <thead className="max-md:hidden">
          <tr className="border-b border-neutral-200 text-left dark:border-neutral-800">
            {stupci.map((s) => {
              const aktivan = sort && s.sortira && sort.kljuc === s.sortira;
              return (
                <th
                  key={s.kljuc}
                  scope="col"
                  className={`px-2 py-2 font-medium whitespace-nowrap ${s.desno ? "text-right" : ""}`}
                  aria-sort={aktivan ? (sort.smjer === "asc" ? "ascending" : "descending") : undefined}
                >
                  {s.sortira && sort ? (
                    <Link
                      href={urlPopisa(putanja, parametri, { sort: s.sortira, smjer: sljedeciSmjer(sort, s.sortira) })}
                      className="inline-flex items-center gap-1 hover:text-primarna-slova"
                      scroll={false}
                    >
                      {s.naslov}
                      <span aria-hidden className={aktivan ? "" : "opacity-30"}>
                        {aktivan && sort.smjer === "desc" ? "▼" : "▲"}
                      </span>
                    </Link>
                  ) : (
                    s.naslov
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="max-md:flex max-md:flex-col max-md:gap-2">
          {redovi.map((r) => (
            <tr key={kljucReda(r)} className="tbl-red">
              {stupci.map((s, i) => {
                const sadrzaj = s.prikaz(r);
                const prvi = s.mobitel === "naslov" || (i === 0 && !stupci.some((x) => x.mobitel === "naslov"));
                return (
                  <td
                    key={s.kljuc}
                    data-oznaka={s.naslov}
                    className={[prvi ? "tbl-c-naslov" : "tbl-c", s.desno ? "tbl-desno" : "", s.mobitel === "skriveno" ? "max-md:hidden" : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {veza && prvi ? (
                      <Link href={veza(r)} className="tbl-veza" prefetch={false}>
                        {sadrzaj}
                      </Link>
                    ) : (
                      <span className="max-md:text-right max-md:break-words">{sadrzaj}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {redovi.length === 0 && (
            <tr className="max-md:block">
              <td colSpan={stupci.length} className="px-2 py-8 text-center text-neutral-500 max-md:block">
                {prazno}
              </td>
            </tr>
          )}
        </tbody>
        {podnozje && redovi.length > 0 && (
          <tfoot className="max-md:mt-2 max-md:block">
            <tr className="border-t-2 border-neutral-300 font-semibold max-md:flex max-md:flex-col max-md:rounded-lg max-md:bg-neutral-50 max-md:p-3 dark:border-neutral-700 max-md:dark:bg-neutral-900">
              {podnozje.map((p, i) => (
                <td
                  key={i}
                  data-oznaka={stupci[i]?.naslov}
                  className={`px-2 py-2 ${stupci[i]?.desno ? "md:text-right md:tabular-nums" : ""} ${p === null || p === undefined || p === "" ? "max-md:hidden" : "max-md:flex max-md:justify-between max-md:px-0 max-md:py-0.5 max-md:before:text-neutral-500 max-md:before:content-[attr(data-oznaka)]"}`}
                >
                  {p}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
