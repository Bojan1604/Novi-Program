import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { danas } from "@/domain/datum";
import { jeUuid } from "@/domain/id";
import { jedan } from "@/domain/popis";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { ObrazacUlaznog } from "../obrazac";

export const metadata = { title: "Novi ulazni račun · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function NoviUlazni({ searchParams }: PageProps<"/ulazni/novi">) {
  const k = await pristupStranici("/ulazni");
  if (!imaPravo(k.prava, "nabava", "operativno")) notFound();
  const sp = await searchParams;
  const narId = jedan(sp["narudzbenica"]);
  const n =
    narId && jeUuid(narId)
      ? await k.db.narudzbenica.findFirst({
          where: { firmaId: k.firmaId, id: narId },
          select: {
            id: true,
            broj: true,
            dobavljac: { select: { id: true, naziv: true } },
            primke: { where: { status: "IZDANA" }, select: { id: true, broj: true } },
          },
        })
      : null;
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Novi ulazni račun" akcije={<GumbVeza href={n ? `/nabava/${n.id}` : "/ulazni"}>Natrag</GumbVeza>} />
      <Kartica>
        <ObrazacUlaznog
          smije
          p={{
            id: null,
            verzija: 0,
            eRacun: false,
            broj: "",
            datum: danas(),
            dospijece: "",
            dobavljac: n?.dobavljac ?? null,
            dobavljacTekst: "",
            dobavljacOib: "",
            narudzbenica: n ? { id: n.id, broj: n.broj } : null,
            primke: n?.primke ?? [],
            primkaId: null,
            zaRobu: !!n,
            osnovica: "",
            pdv: "",
            opis: "",
          }}
        />
      </Kartica>
    </Stranica>
  );
}
