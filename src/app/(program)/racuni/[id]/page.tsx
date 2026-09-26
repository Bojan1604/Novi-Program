import { pristupStranici } from "@/lib/akcija";
import { StranicaDokumenta } from "../../ponude/stranica-dokumenta";

export default async function Racun({ params, searchParams }: PageProps<"/racuni/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/racuni");
  const v = (await searchParams)["vrsta"];
  return <StranicaDokumenta id={id} vrstaNovog={v === "PREDUJAM" ? "PREDUJAM" : "RACUN"} k={k} />;
}
