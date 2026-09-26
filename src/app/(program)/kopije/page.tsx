import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { pristupStranici } from "@/lib/akcija";
import { CUVA_SE } from "@/services/kopije";
import { IzradiKopiju, VratiKopiju } from "./obrasci";

export const metadata = { title: "Sigurnosne kopije · ERP-WMS" };
export const dynamic = "force-dynamic";

const vrijeme = (d: Date) => new Intl.DateTimeFormat("hr-HR", { timeZone: "Europe/Zagreb", dateStyle: "short", timeStyle: "short" }).format(d);
const velicina = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const zapisa = (r: unknown) => Object.values((r ?? {}) as Record<string, number>).reduce((s, n) => s + n, 0);

export default async function Kopije() {
  const k = await pristupStranici("/kopije");
  const kopije = await k.db.sigurnosnaKopija.findMany({
    where: { firmaId: k.firmaId },
    orderBy: { vrijeme: "desc" },
    select: { id: true, vrijeme: true, vrsta: true, velicina: true, korisnik: true, redaka: true },
  });
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="Sigurnosne kopije"
        opis={`Kopija sadrži sve podatke firme (i priloge). Dnevna se radi sama poslije 02:00 i čuva ${CUVA_SE.DNEVNA} dana; ručnih se čuva zadnjih ${CUVA_SE.RUCNA}. Preuzete kopije čuvajte izvan poslužitelja.`}
      />
      <Kartica>
        <IzradiKopiju />
      </Kartica>
      <Kartica naslov="Spremljene kopije">
        {kopije.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Još nema kopija.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800" data-testid="kopije">
            {kopije.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium">{vrijeme(c.vrijeme)}</span>
                  <Znacka boja={c.vrsta === "DNEVNA" ? "plava" : "siva"}>{c.vrsta === "DNEVNA" ? "dnevna" : "ručna"}</Znacka>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {velicina(c.velicina)} · {zapisa(c.redaka).toLocaleString("hr-HR")} zapisa · {c.korisnik}
                  </span>
                </div>
                <a className="text-blue-700 underline dark:text-blue-400" href={`/api/kopije/${c.id}`} download>
                  Preuzmi
                </a>
              </li>
            ))}
          </ul>
        )}
      </Kartica>
      <Kartica naslov="Vraćanje u novu firmu">
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Kopija se uvijek vraća u novu firmu (s novim nazivom i OIB-om) — postojeći podaci se nikad ne prepisuju. Vi postajete administrator nove
          firme; fiskalizacija je u njoj u demo načinu dok je ne uključite, a pristup portalu klijentima dajete nanovo (na kartici partnera).
        </p>
        <VratiKopiju
          key={kopije[0]?.id ?? "prazno"}
          kopije={kopije.map((c) => ({ id: c.id, opis: `${vrijeme(c.vrijeme)} (${c.vrsta === "DNEVNA" ? "dnevna" : "ručna"})` }))}
        />
      </Kartica>
    </Stranica>
  );
}
