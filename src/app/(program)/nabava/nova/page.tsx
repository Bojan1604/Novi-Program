import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { NovaNarudzbenica } from "../obrasci";

export const metadata = { title: "Nova narudžbenica · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function Nova() {
  const k = await pristupStranici("/nabava");
  if (!imaPravo(k.prava, "nabava", "operativno")) notFound();
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Nova narudžbenica" akcije={<GumbVeza href="/nabava">Natrag</GumbVeza>} />
      <Kartica>
        <NovaNarudzbenica danas={danas()} vidiCijene={imaPosebno(k.prava, "costs")} />
      </Kartica>
    </Stranica>
  );
}
