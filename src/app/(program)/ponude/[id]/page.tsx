import { pristupStranici } from "@/lib/akcija";
import { StranicaDokumenta } from "../stranica-dokumenta";

export default async function Dokument({ params, searchParams }: PageProps<"/ponude/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/ponude");
  return <StranicaDokumenta id={id} vrstaNovog={(await searchParams)["vrsta"]} k={k} />;
}
