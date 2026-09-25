import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { Tablica } from "@/components/ui/tablica";
import { formatirajIznos } from "@/domain/novac";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { popisCjenika } from "@/queries/partneri";

export const metadata = { title: "Cjenici · ERP-WMS" };

export default async function Cjenici() {
  const k = await pristupStranici("/cjenici");
  const cjenici = await popisCjenika(k.db, k.firmaId);
  return (
    <Stranica>
      <NaslovStranice
        naslov="Cjenici"
        opis="Posebne cijene za kupce. Kupac bez cjenika plaća preporučene cijene modela i usluga."
        akcije={
          imaPravo(k.prava, "partneri", "operativno") && (
            <GumbVeza href="/cjenici/novi" varijanta="primarni">
              Novi cjenik
            </GumbVeza>
          )
        }
      />
      <Kartica>
        <Tablica
          testId="popis-cjenika"
          putanja="/cjenici"
          parametri={{}}
          redovi={cjenici}
          kljucReda={(c) => c.id}
          veza={(c) => `/cjenici/${c.id}`}
          stupci={[
            {
              kljuc: "naziv",
              naslov: "Naziv",
              prikaz: (c) => (
                <span className="inline-flex flex-wrap gap-1">
                  {c.naziv} {!c.aktivan && <Znacka boja="crvena">deaktiviran</Znacka>}
                </span>
              ),
            },
            { kljuc: "popust", naslov: "Popust", desno: true, prikaz: (c) => (c.popust ? `${formatirajIznos(c.popust)} %` : "") },
            { kljuc: "stavke", naslov: "Stavki", desno: true, prikaz: (c) => c.stavki },
            { kljuc: "partneri", naslov: "Kupaca", desno: true, prikaz: (c) => c.partnera },
          ]}
        />
      </Kartica>
    </Stranica>
  );
}
