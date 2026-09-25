import { redirect } from "next/navigation";
import { NaslovStranice, Stranica } from "@/components/ui/stranica";
import { Obavijest } from "@/components/ui/obavijest";
import { prvaDopustena } from "@/domain/izbornik";
import { imaPravo } from "@/domain/prava";
import { trenutniKontekst } from "@/lib/akcija";
import { IZBORNIK } from "@/lib/izbornik";

export default async function Pocetna() {
  const k = await trenutniKontekst();
  if (!k) redirect("/prijava");
  if (!imaPravo(k.prava, "nadzorna", "pregled")) {
    const prva = prvaDopustena(k.prava, IZBORNIK);
    if (prva && prva !== "/") redirect(prva);
    return (
      <Stranica sirina="3xl">
        <NaslovStranice naslov={`Dobro došli, ${k.sesija.korisnik.ime}`} />
        <Obavijest vrsta="upozorenje">Još vam nisu dodijeljena prava. Javite se administratoru.</Obavijest>
      </Stranica>
    );
  }
  return (
    <Stranica>
      <NaslovStranice naslov={`Dobro došli, ${k.sesija.korisnik.ime}`} opis={`${k.sesija.korisnik.email} · ${k.sesija.firma.naziv}`} />
    </Stranica>
  );
}
