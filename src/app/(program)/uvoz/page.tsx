import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { pristupStranici } from "@/lib/akcija";
import { Uvoz } from "./obrazac";

export const metadata = { title: "Uvoz iz starog programa · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function StranicaUvoza() {
  await pristupStranici("/uvoz");
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="Uvoz iz starog programa"
        opis="Šifrarnici, partneri, uređaji, izdani računi s uplatama i ugovori najma iz JSON datoteke (format: docs/UVOZ.md). Prvo provjera — ništa se ne upisuje dok ne pokrenete uvoz."
      />
      <Kartica>
        <Uvoz />
      </Kartica>
      <Kartica naslov="Kako">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
          <li>Prije uvoza izradite sigurnosnu kopiju (stranica „Sigurnosne kopije“).</li>
          <li>Provjera prikazuje greške (uvoz nije moguć), upozorenja i razlike iznosa računa između starog programa i izračuna iz stavki.</li>
          <li>Uvezeni računi su izdani i zaključani; s JIR-om se vode kao fiskalizirani i nikad se ne šalju CIS-u.</li>
          <li>Numeracija se nastavlja iza zadnjeg uvezenog broja u istom nizu (prostor/uređaj) i godini.</li>
          <li>Mjeseci najma do „naplacenoDo“ označe se naplaćenima izvan programa — program ih ne nudi ponovno.</li>
        </ol>
      </Kartica>
    </Stranica>
  );
}
