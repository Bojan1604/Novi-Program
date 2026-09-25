import { GumbVeza } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { NaslovStranice, Stranica } from "@/components/ui/stranica";

export default function NemaPristupa() {
  return (
    <Stranica sirina="3xl">
      <NaslovStranice naslov="Nemate pristup" />
      <Obavijest vrsta="upozorenje">Za ovu stranicu nemate pravo. Ako vam treba, javite se administratoru.</Obavijest>
      <div>
        <GumbVeza href="/">Na početnu</GumbVeza>
      </div>
    </Stranica>
  );
}
