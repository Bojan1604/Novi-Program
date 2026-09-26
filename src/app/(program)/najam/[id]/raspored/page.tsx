import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { danas } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { jeMjesec, mjesecOd, rateUredaja, sljedeciMjesec } from "@/domain/najam";
import { formatirajIznos } from "@/domain/novac";
import { jedan, stranica } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { podaciZaNaplatu } from "@/services/najam";
import { RasporedNajma, type RedakRasporeda } from "../../raspored";

export const metadata = { title: "Raspored najma · ERP-WMS" };
export const dynamic = "force-dynamic";

const PO_STRANICI = 100;

/** Raspored: 12 mjeseci × uređaji ugovora, po 100 uređaja na stranici. */
export default async function Raspored({ params, searchParams }: PageProps<"/najam/[id]/raspored">) {
  const k = await pristupStranici("/najam");
  const { id } = await params;
  if (!jeUuid(id)) notFound();
  const sp = await searchParams;
  const u = await k.db.ugovorNajma.findFirst({
    where: { firmaId: k.firmaId, id },
    select: { id: true, broj: true, partner: { select: { naziv: true } } },
  });
  if (!u) notFound();
  const tekuci = mjesecOd(danas());
  const zadano = sljedeciMjesec(tekuci, -5);
  const od = jeMjesec(jedan(sp["od"])) ? jedan(sp["od"])! : zadano;
  const mjeseci = Array.from({ length: 12 }, (_, i) => sljedeciMjesec(od, i));
  const str = stranica(sp["stranica"]);
  const [ukupno, n] = await Promise.all([
    k.db.uredajNaUgovoru.count({ where: { firmaId: k.firmaId, ugovorId: u.id } }),
    podaciZaNaplatu(db, k.firmaId, u.id, { skip: (str - 1) * PO_STRANICI, take: PO_STRANICI }),
  ]);
  const redovi: RedakRasporeda[] = n.planovi.map((p, i) => {
    const rate = new Map(rateUredaja(n.uvjeti, n.motor[i]!, n.fakturirano, mjeseci[11]!).map((r) => [r.mjesec, r]));
    let zbroj = 0;
    const celije = mjeseci.map((m) => {
      const r = rate.get(m);
      if (!r) return { mjesec: m, iznos: "", izvor: "NEMA" as const };
      zbroj += r.iznos;
      return { mjesec: m, iznos: formatirajIznos(r.iznos), izvor: r.izvor };
    });
    return { planId: p.id, uredajId: p.uredaj.id, serijski: p.uredaj.serijski, celije, zbroj: formatirajIznos(zbroj) };
  });
  const veza = (m: string) => `/najam/${u.id}/raspored?od=${m}`;
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov={`Raspored · ${u.broj}`}
        opis={`${u.partner.naziv} · ${mjeseci[0]!.slice(5)}/${mjeseci[0]!.slice(0, 4)} – ${mjeseci[11]!.slice(5)}/${mjeseci[11]!.slice(0, 4)}`}
        akcije={
          <>
            <GumbVeza href={veza(sljedeciMjesec(od, -12))}>← 12 mj.</GumbVeza>
            <GumbVeza href={veza(sljedeciMjesec(od, 12))}>12 mj. →</GumbVeza>
            <GumbVeza href={`/najam/${u.id}`}>Ugovor</GumbVeza>
          </>
        }
      />
      <Kartica>
        <RasporedNajma ugovorId={u.id} mjeseci={mjeseci} redovi={redovi} smije={imaPravo(k.prava, "najam", "operativno")} />
        <div className="mt-3">
          <Stranicenje putanja={`/najam/${u.id}/raspored`} parametri={{ od }} stranica={str} velicina={PO_STRANICI} ukupno={ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
