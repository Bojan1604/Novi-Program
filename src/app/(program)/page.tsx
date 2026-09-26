import Link from "next/link";
import { redirect } from "next/navigation";
import { StupcaniGrafikon } from "@/components/ui/grafikon";
import { Obavijest } from "@/components/ui/obavijest";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { prvaDopustena } from "@/domain/izbornik";
import { sljedeciMjesec } from "@/domain/najam";
import { formatirajIznos } from "@/domain/novac";
import { imaPravo } from "@/domain/prava";
import { trenutniKontekst } from "@/lib/akcija";
import { db } from "@/lib/db";
import { IZBORNIK } from "@/lib/izbornik";
import { podaciNadzorne } from "@/queries/nadzorna";

const MJESECI = ["sij", "velj", "ožu", "tra", "svi", "lip", "srp", "kol", "ruj", "lis", "stu", "pro"];

export default async function Pocetna() {
  const k = await trenutniKontekst();
  if (!k) redirect("/prijava");
  if (!imaPravo(k.prava, "nadzorna", "pregled")) {
    const prva = prvaDopustena(k.prava, IZBORNIK);
    if (prva && prva !== "/") redirect(prva);
    return (
      <Stranica sirina="3xl">
        <NaslovStranice naslov={`Dobro došli, ${k.sesija.korisnik.ime}`} />
        <Obavijest vrsta="upozorenje">Još vam nisu dodijeljena prava. Javite se administratoru.</Obavijest>
      </Stranica>
    );
  }
  const dan = danas();
  const p = await podaciNadzorne(db, k.firmaId, k.prava, dan);
  const mjeseci = Array.from({ length: 12 }, (_, i) => sljedeciMjesec(dan.slice(0, 7), i - 11));
  return (
    <Stranica sirina="7xl">
      <NaslovStranice naslov={`Dobro došli, ${k.sesija.korisnik.ime}`} opis={`${k.sesija.korisnik.email} · ${k.sesija.firma.naziv}`} />
      {p.upozorenja.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="upozorenja">
          {p.upozorenja.map((u) => (
            <Link key={u.kljuc} href={u.veza} className="block">
              <Obavijest vrsta={u.razina}>{u.tekst} →</Obavijest>
            </Link>
          ))}
        </div>
      )}
      {p.kartice.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="kartice-nadzorne">
          {p.kartice.map((c) => (
            <Link
              key={c.kljuc}
              href={c.veza}
              data-kartica={c.kljuc}
              className="flex min-w-0 flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-3 hover:border-primarna dark:border-neutral-800 dark:bg-neutral-950"
            >
              <span className="text-xs text-neutral-500">{c.naslov}</span>
              <span className="text-xl font-semibold break-words sm:text-2xl" data-vrijednost={c.vrijednost}>
                {c.vrsta === "iznos" ? `${formatirajIznos(c.vrijednost)} €` : c.vrijednost.toLocaleString("hr-HR")}
              </span>
              {c.opis && <span className="text-xs text-neutral-500">{c.opis}</span>}
            </Link>
          ))}
        </div>
      )}
      {p.prihodPoMjesecima.length > 0 && (
        <Kartica naslov="Prihod po mjesecima (bez PDV-a)">
          <StupcaniGrafikon
            opis="Prihod po mjesecima, zadnjih 12 mjeseci"
            oznake={mjeseci.map((m) => `${MJESECI[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`)}
            serije={["Prihod"]}
            vrijednosti={mjeseci.map((m) => [p.prihodPoMjesecima.find((x) => x.mjesec === m)?.osnovica ?? 0])}
            format={(n) => `${formatirajIznos(n)} €`}
          />
        </Kartica>
      )}
    </Stranica>
  );
}
