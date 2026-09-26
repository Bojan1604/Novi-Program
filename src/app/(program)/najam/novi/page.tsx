import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { ObrazacUgovora } from "../obrazac";

export const metadata = { title: "Novi ugovor o najmu · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function NoviUgovor() {
  const k = await pristupStranici("/najam");
  if (!imaPravo(k.prava, "najam", "operativno")) notFound();
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Novi ugovor o najmu" akcije={<GumbVeza href="/najam">Natrag</GumbVeza>} />
      <Kartica>
        <ObrazacUgovora
          smije
          p={{
            id: null,
            verzija: 0,
            broj: "",
            partner: null,
            poslovnicaId: null,
            poslovnice: [],
            od: danas(),
            do: "",
            rokPlacanjaDana: 15,
            nacinPlacanja: "T",
            uvjeti: "",
            napomenaRacuna: "",
          }}
        />
      </Kartica>
    </Stranica>
  );
}
