import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { DNEVNIK_NAJMANJE_MJESECI } from "@/domain/opasna-zona";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { stanjeOdrzavanja } from "@/services/opasna-zona";
import { BrisanjePodataka, CiscenjeDnevnika } from "./obrasci";

export const metadata = { title: "Opasna zona · ERP-WMS" };
export const dynamic = "force-dynamic";

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(0)} MB`;

export default async function OpasnaZona() {
  const k = await pristupStranici("/opasna-zona");
  const [stanje, firma] = await Promise.all([
    stanjeOdrzavanja(db, k.firmaId),
    db.firma.findUniqueOrThrow({ where: { id: k.firmaId }, select: { naziv: true } }),
  ]);
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="Opasna zona"
        opis="Radnje koje se ne mogu poništiti. Svaka traži vašu lozinku i zapisuje se u dnevnik; prije brisanja podataka program sam izradi sigurnosnu kopiju."
      />
      <Kartica naslov="Održavanje">
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400" data-testid="odrzavanje">
          Dnevnik: {stanje.dnevnik.toLocaleString("hr-HR")} zapisa
          {stanje.najstariji ? `, najstariji od ${stanje.najstariji.toISOString().slice(0, 10)}` : ""}. Veličina baze: {mb(stanje.velicinaBaze)}.
          Istekle sesije i stari pokušaji prijave brišu se sami svakih sat vremena. Dnevnik se može čistiti samo za zapise starije od{" "}
          {DNEVNIK_NAJMANJE_MJESECI} mjeseci.
        </p>
        <CiscenjeDnevnika />
      </Kartica>
      <Kartica naslov="Brisanje podataka">
        <p className="mb-3 text-sm text-red-700 dark:text-red-400">
          Briše podatke samo ove firme. Računi fiskalizirani u produkciji ne mogu se obrisati (zakonsko čuvanje 11 godina).
        </p>
        <BrisanjePodataka naziv={firma.naziv} />
      </Kartica>
    </Stranica>
  );
}
