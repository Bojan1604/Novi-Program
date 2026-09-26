import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { stanjeDvaKoraka } from "@/services/dva-koraka";
import { DvaKoraka } from "./dva-koraka";
import { MojiPodaci, PromjenaLozinke } from "./obrazac";

export const metadata = { title: "Moj račun · ERP-WMS" };

export default async function MojRacun() {
  const k = await pristupStranici("/moj-racun");
  return (
    <Stranica sirina="3xl">
      <NaslovStranice naslov="Moj račun" opis={`${k.sesija.korisnik.ime} · ${k.sesija.korisnik.email}`} />
      <Kartica naslov="Moji podaci">
        <MojiPodaci ime={k.sesija.korisnik.ime} email={k.sesija.korisnik.email} />
      </Kartica>
      <Kartica naslov="Promjena lozinke">
        <PromjenaLozinke />
      </Kartica>
      <Kartica naslov="Prijava u dva koraka">
        <DvaKoraka {...await stanjeDvaKoraka(db, k.korisnikId)} />
      </Kartica>
    </Stranica>
  );
}
