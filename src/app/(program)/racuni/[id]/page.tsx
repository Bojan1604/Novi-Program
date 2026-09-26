import { pristupStranici } from "@/lib/akcija";
import { StranicaDokumenta } from "../../ponude/stranica-dokumenta";

export default async function Racun({ params }: PageProps<"/racuni/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/racuni");
  return <StranicaDokumenta id={id} vrstaNovog="RACUN" k={k} />;
}
