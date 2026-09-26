import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { PLATFORME, type Platforma } from "@/domain/mdm";
import { imaPravo } from "@/domain/prava";
import { velicinaZaPrikaz } from "@/domain/prilozi";
import { pristupStranici } from "@/lib/akcija";
import { NovaAplikacija } from "../upravljanje";

export const metadata = { title: "MDM aplikacije · ERP-WMS" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "Europe/Zagreb" });

export default async function Aplikacije() {
  const k = await pristupStranici("/mdm");
  const sve = await k.db.mdmAplikacija.findMany({
    where: { firmaId: k.firmaId },
    orderBy: [{ paket: "asc" }, { platforma: "asc" }, { verzijaKod: "desc" }],
    select: { id: true, naziv: true, paket: true, platforma: true, verzija: true, verzijaKod: true, velicina: true, stvoreno: true, korisnik: true },
  });
  const grupe = new Map<string, typeof sve>();
  for (const a of sve) grupe.set(`${a.paket}|${a.platforma}`, [...(grupe.get(`${a.paket}|${a.platforma}`) ?? []), a]);
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="MDM aplikacije"
        opis="Nova verzija (veći broj verzije) sama stiže na uređaje organizacija kojima je aplikacija dodijeljena."
        akcije={<GumbVeza href="/mdm">Natrag</GumbVeza>}
      />
      {[...grupe.values()].map((v) => (
        <Kartica key={`${v[0]!.paket}|${v[0]!.platforma}`} naslov={`${v[0]!.naziv} · ${v[0]!.paket}`}>
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="verzije-aplikacije">
            {v.map((a, i) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  {a.verzija} <span className="text-neutral-500">(broj {a.verzijaKod})</span> {i === 0 && <Znacka boja="zelena">najnovija</Znacka>}
                </span>
                <span className="text-xs text-neutral-500">
                  {PLATFORME[a.platforma as Platforma]} · {velicinaZaPrikaz(a.velicina)} · {datum.format(a.stvoreno)} · {a.korisnik}
                </span>
              </li>
            ))}
          </ul>
        </Kartica>
      ))}
      {imaPravo(k.prava, "mdm", "operativno") && (
        <Kartica naslov="Nova aplikacija ili nova verzija">
          <NovaAplikacija />
        </Kartica>
      )}
    </Stranica>
  );
}
