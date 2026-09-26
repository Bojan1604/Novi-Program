import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { PDV_REZIMI, pdvNabave, STATUSI_NARUDZBE, type PdvRezim, type StatusNarudzbe } from "@/domain/nabava";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { StatusNarudzbenice, Zaprimanje } from "../obrasci";
import { trosakPoNarudzbenici } from "@/services/ulazni-racuni";
import { db } from "@/lib/db";

export const metadata = { title: "Narudžbenica · ERP-WMS" };
export const dynamic = "force-dynamic";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });

export default async function Narudzbenica({ params }: PageProps<"/nabava/[id]">) {
  const k = await pristupStranici("/nabava");
  const { id } = await params;
  if (!jeUuid(id)) notFound();
  const n = await k.db.narudzbenica.findFirst({
    where: { firmaId: k.firmaId, id },
    include: {
      dobavljac: { select: { id: true, naziv: true, drzava: true } },
      stavke: { orderBy: { redoslijed: "asc" }, include: { model: { select: { naziv: true, proizvodjac: { select: { naziv: true } } } } } },
      primke: { orderBy: { datum: "asc" }, select: { id: true, broj: true, datum: true, status: true, brojUredaja: true } },
    },
  });
  if (!n) notFound();
  const vidiCijene = imaPosebno(k.prava, "costs");
  const trosak = vidiCijene ? await trosakPoNarudzbenici(db, k.firmaId, n.id) : null;
  const racuni = await k.db.ulazniRacun.findMany({
    where: { firmaId: k.firmaId, narudzbenicaId: n.id },
    orderBy: { datum: "asc" },
    select: { id: true, interni: true, broj: true, zaRobu: true, status: true },
  });
  const osnovica = centiIzDecimala(n.osnovica.toFixed(2));
  const pdv = pdvNabave(n.pdvRezim as PdvRezim, osnovica);
  const otvorena = n.status === "OTVORENA" || n.status === "DJELOMICNO";
  const skladista = otvorena
    ? await k.db.skladiste.findMany({
        where: { firmaId: k.firmaId, aktivan: true },
        orderBy: [{ zadano: "desc" }, { naziv: "asc" }],
        select: { id: true, naziv: true },
      })
    : [];
  const naziv = (s: (typeof n.stavke)[number]) => `${s.model.proizvodjac.naziv} ${s.model.naziv}`;
  const radnje: ("ZATVORI" | "STORNO" | "OTVORI")[] = n.status === "ZATVORENA" ? ["OTVORI"] : n.status === "STORNIRANA" ? [] : ["ZATVORI", "STORNO"];
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov={`Narudžbenica ${n.broj}`}
        opis={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={`/partneri/${n.dobavljac.id}`} className="text-primarna hover:underline">
              {n.dobavljac.naziv}
            </Link>
            · {datum.format(n.datum)} · <Znacka>{STATUSI_NARUDZBE[n.status as StatusNarudzbe]}</Znacka>
          </span>
        }
        akcije={<GumbVeza href="/nabava">Natrag</GumbVeza>}
      />
      <Kartica naslov="Stavke">
        <table className="w-full text-sm" data-testid="stavke-narudzbenice">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
              <th className="py-1 pr-2">Model</th>
              <th className="py-1 pr-2 text-right">Naručeno</th>
              <th className="py-1 pr-2 text-right">Zaprimljeno</th>
              {vidiCijene && <th className="py-1 text-right">Cijena</th>}
            </tr>
          </thead>
          <tbody>
            {n.stavke.map((s) => (
              <tr key={s.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-1 pr-2">{naziv(s)}</td>
                <td className="py-1 pr-2 text-right">{s.kolicina}</td>
                <td className="py-1 pr-2 text-right">{s.zaprimljeno}</td>
                {vidiCijene && <td className="py-1 text-right">{formatirajIznos(centiIzDecimala(s.cijena.toFixed(2)))} €</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">{PDV_REZIMI[n.pdvRezim as PdvRezim]}</p>
        {vidiCijene && (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-testid="pdv-nabave">
            <div>
              <dt className="text-xs text-neutral-500">Osnovica</dt>
              <dd>{formatirajIznos(osnovica)} €</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Za platiti dobavljaču</dt>
              <dd>{formatirajIznos(pdv.naPlatiti)} €</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Pretporez</dt>
              <dd>{formatirajIznos(pdv.pretporez)} €</dd>
            </div>
            {pdv.samooporezivanje > 0 && (
              <div>
                <dt className="text-xs text-neutral-500">Obračunati PDV (prijenos obveze)</dt>
                <dd>{formatirajIznos(pdv.samooporezivanje)} €</dd>
              </div>
            )}
          </dl>
        )}
        {n.napomena && <p className="mt-3 text-sm whitespace-pre-line">{n.napomena}</p>}
        {imaPravo(k.prava, "nabava", "puno") && radnje.length > 0 && (
          <div className="mt-4">
            <StatusNarudzbenice id={n.id} radnje={radnje} />
          </div>
        )}
      </Kartica>
      {otvorena && imaPravo(k.prava, "nabava", "operativno") && (
        <Kartica naslov="Zaprimanje">
          <Zaprimanje
            narudzbenicaId={n.id}
            stavke={n.stavke.map((s) => ({ id: s.id, naziv: naziv(s), preostalo: s.kolicina - s.zaprimljeno }))}
            skladista={skladista}
            danas={danas()}
          />
        </Kartica>
      )}
      <Kartica naslov={`Ulazni računi (${racuni.length})`}>
        {racuni.length > 0 && (
          <ul className="mb-3 flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="racuni-narudzbenice">
            {racuni.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 py-1.5">
                <Link href={`/ulazni/${r.id}`} className="text-primarna hover:underline">
                  {r.interni} · {r.broj}
                </Link>
                <span>
                  {r.zaRobu ? "roba" : "prijevoz / usluga"}
                  {r.status === "STORNIRAN" || r.status === "ODBIJEN" ? " · ne računa se" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {imaPravo(k.prava, "nabava", "operativno") && <GumbVeza href={`/ulazni/novi?narudzbenica=${n.id}`}>Upiši ulazni račun</GumbVeza>}
        {trosak && (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-testid="trosak-robe">
            <div>
              <dt className="text-xs text-neutral-500">Primke</dt>
              <dd>{formatirajIznos(trosak.primke)} €</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Računi za robu</dt>
              <dd>{formatirajIznos(trosak.racuniRobe)} €</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Trošak robe (veći)</dt>
              <dd className="font-medium">{formatirajIznos(trosak.roba)} €</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Prijevoz i usluge</dt>
              <dd>{formatirajIznos(trosak.zasebno)} €</dd>
            </div>
          </dl>
        )}
      </Kartica>
      <Kartica naslov={`Primke (${n.primke.length})`}>
        {n.primke.length ? (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="primke-narudzbenice">
            {n.primke.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-1.5">
                <Link href={`/primke/${p.id}`} className="text-primarna hover:underline">
                  {p.broj}
                </Link>
                <span>
                  {datum.format(p.datum)} · {p.brojUredaja} kom{p.status === "STORNIRANA" ? " · stornirana" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">Još ništa nije zaprimljeno.</p>
        )}
      </Kartica>
    </Stranica>
  );
}
