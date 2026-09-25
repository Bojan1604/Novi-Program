import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { pristupStranici } from "@/lib/akcija";
import { PromjenaLozinke } from "./obrazac";

export const metadata = { title: "Moj račun · ERP-WMS" };

export default async function MojRacun() {
  const k = await pristupStranici("/moj-racun");
  return (
    <Stranica sirina="3xl">
      <NaslovStranice naslov="Moj račun" opis={`${k.sesija.korisnik.ime} · ${k.sesija.korisnik.email}`} />
      <Kartica naslov="Promjena lozinke">
        <PromjenaLozinke />
      </Kartica>
    </Stranica>
  );
}
