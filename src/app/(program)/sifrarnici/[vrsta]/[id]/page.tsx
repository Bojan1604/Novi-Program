import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { definicija } from "@/lib/sifrarnici";
import { opcijeOdabira, vidljivaPolja, zapisSifrarnika } from "@/queries/sifrarnici";
import { AkcijeZapisa, ObrazacSifrarnika } from "../../obrazac";

export default async function ZapisSifrarnika({ params }: PageProps<"/sifrarnici/[vrsta]/[id]">) {
  const { vrsta, id } = await params;
  const def = definicija(vrsta);
  if (!def) notFound();
  const k = await pristupStranici("/sifrarnici");
  const vidiNabavne = imaPosebno(k.prava, "costs");
  const smijeUredivati = imaPravo(k.prava, "sifrarnici", "operativno");
  const polja = vidljivaPolja(def, vidiNabavne);
  const put = `/sifrarnici/${def.kljuc}`;

  if (id === "novi") {
    if (!smijeUredivati) notFound();
    const pocetno = Object.fromEntries(def.polja.map((p) => [p.ime, p.ime === "jamstvoMjeseci" ? 24 : p.ime === "jedinica" ? "kom" : null]));
    return (
      <Stranica sirina="3xl">
        <NaslovStranice naslov={`Novi zapis: ${def.jednina.toLowerCase()}`} akcije={<GumbVeza href={put}>Natrag</GumbVeza>} />
        <Kartica>
          <ObrazacSifrarnika
            kljuc={def.kljuc}
            id={null}
            polja={polja}
            vrijednosti={pocetno}
            opcije={await opcijeOdabira(k.db, k.firmaId, def)}
            smijeUredivati
          />
        </Kartica>
      </Stranica>
    );
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const z = await zapisSifrarnika(k.db, k.firmaId, def, id, vidiNabavne);
  if (!z) notFound();
  return (
    <Stranica sirina="3xl">
      <NaslovStranice naslov={z.naziv} opis={def.jednina} akcije={<GumbVeza href={put}>Natrag</GumbVeza>} />
      {!z.aktivan && <Obavijest vrsta="upozorenje">Deaktivirano — ne nudi se pri unosu novih podataka, ali povijest ostaje.</Obavijest>}
      <Kartica>
        <ObrazacSifrarnika
          kljuc={def.kljuc}
          id={z.id}
          polja={polja}
          vrijednosti={z.vrijednosti}
          opcije={await opcijeOdabira(k.db, k.firmaId, def, z.vrijednosti)}
          smijeUredivati={smijeUredivati}
        />
      </Kartica>
      {smijeUredivati && (
        <Kartica naslov="Aktivnost">
          <AkcijeZapisa kljuc={def.kljuc} id={z.id} aktivan={z.aktivan} smijeBrisati={imaPravo(k.prava, "sifrarnici", "puno")} />
        </Kartica>
      )}
    </Stranica>
  );
}
