import { NaslovStranice, Stranica } from "@/components/ui/stranica";
import { pristupStranici } from "@/lib/akcija";
import { Skeniranje } from "./skeniranje";

export const metadata = { title: "Skeniranje · ERP-WMS" };

export default async function StranicaSkeniranja() {
  await pristupStranici("/skeniranje");
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="Skeniranje"
        opis="USB skener, kamera mobitela ili slika naljepnice — pronađite uređaj ili skenirajte više njih odjednom."
      />
      <Skeniranje />
    </Stranica>
  );
}
