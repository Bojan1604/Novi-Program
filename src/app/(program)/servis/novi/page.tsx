import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { jedan } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { NoviNalog } from "../obrasci";

export const metadata = { title: "Prijem na servis · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function Novi({ searchParams }: PageProps<"/servis/novi">) {
  const k = await pristupStranici("/servis");
  if (!imaPravo(k.prava, "servis", "operativno")) notFound();
  const sp = await searchParams;
  const skladista = await k.db.skladiste.findMany({
    where: { firmaId: k.firmaId, aktivan: true },
    orderBy: { naziv: "asc" },
    select: { id: true, naziv: true },
  });
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="Prijem na servis"
        opis="Uređaj mora biti u programu (sa skladišta, prodan ili u najmu). Stanje prije servisa se pamti i vraća na kraju."
        akcije={<GumbVeza href="/servis">Natrag</GumbVeza>}
      />
      <Kartica>
        <NoviNalog danas={danas()} skladista={skladista} serijski={(jedan(sp["serijski"]) ?? "").slice(0, 60)} />
      </Kartica>
    </Stranica>
  );
}
