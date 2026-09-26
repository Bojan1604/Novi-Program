import Link from "next/link";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { danas } from "@/domain/datum";
import { mjesecOd, zaIzdati } from "@/domain/najam";
import { formatirajIznos } from "@/domain/novac";
import { stranica, velicina } from "@/domain/popis";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { podaciZaNaplatu } from "@/services/najam";
import { IzdajRate } from "../rate";

export const metadata = { title: "Rate za izdati · ERP-WMS" };
export const dynamic = "force-dynamic";

/** Rate za izdati po ugovorima (stranica po stranica ugovora, da radi i s tisućama uređaja). */
export default async function RateZaIzdati({ searchParams }: PageProps<"/najam/rate">) {
  const k = await pristupStranici("/najam/rate");
  const sp = await searchParams;
  const str = stranica(sp["stranica"]);
  const vel = Math.min(velicina(sp["velicina"]), 50);
  const tekuci = mjesecOd(danas());
  const where = { firmaId: k.firmaId, uredaji: { some: {} } };
  const [ukupno, ugovori] = await Promise.all([
    k.db.ugovorNajma.count({ where }),
    k.db.ugovorNajma.findMany({
      where,
      orderBy: [{ partner: { naziv: "asc" } }, { broj: "asc" }],
      skip: (str - 1) * vel,
      take: vel,
      select: { id: true, broj: true, partner: { select: { naziv: true } } },
    }),
  ]);
  const redovi = await Promise.all(
    ugovori.map(async (u) => {
      const n = await podaciZaNaplatu(db, k.firmaId, u.id);
      const rate = zaIzdati(n.uvjeti, n.motor, n.fakturirano, tekuci);
      return {
        ...u,
        broj: u.broj,
        rata: rate.length,
        iznos: rate.reduce((a, r) => a + r.iznos, 0),
        najstarija: rate.map((r) => r.mjesec).sort()[0] ?? null,
      };
    }),
  );
  const zbroj = redovi.reduce((a, r) => a + r.iznos, 0);
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov="Rate za izdati"
        opis={`Nefakturirane rate do ${tekuci.slice(5)}/${tekuci.slice(0, 4)} po ugovorima. Račun dobiva današnji datum.`}
        akcije={<GumbVeza href="/najam">Ugovori</GumbVeza>}
      />
      <Kartica>
        <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" data-testid="rate-po-ugovorima">
          {redovi.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${r.rata ? "" : "opacity-60"}`}>
              <div className="min-w-0">
                <Link href={`/najam/${r.id}`} className="font-medium text-primarna hover:underline">
                  {r.broj}
                </Link>{" "}
                · {r.partner.naziv}
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  {r.rata
                    ? `${r.rata} rata · ${formatirajIznos(r.iznos)} € bez PDV-a${r.najstarija && r.najstarija < tekuci ? ` · zaostale od ${r.najstarija.slice(5)}/${r.najstarija.slice(0, 4)}` : ""}`
                    : "Nema rata za izdati."}
                </div>
              </div>
              {r.rata > 0 && <IzdajRate ugovorId={r.id} mjesec={tekuci} />}
            </li>
          ))}
        </ul>
        {redovi.length === 0 && <p className="text-sm text-neutral-500">Nema ugovora s uređajima.</p>}
        <p className="mt-3 text-sm font-medium">Ukupno na ovoj stranici: {formatirajIznos(zbroj)} € bez PDV-a</p>
        <div className="mt-3">
          <Stranicenje putanja="/najam/rate" parametri={{}} stranica={str} velicina={vel} ukupno={ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
