import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { imaPravo, praznaPrava } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { uloga } from "@/queries/korisnici";
import { ObrazacUloge, ObrisiUlogu } from "../obrasci";

export default async function Uloga({ params }: PageProps<"/uloge/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/uloge");
  const smijeUredivati = imaPravo(k.prava, "korisnici", "puno");

  if (id === "nova") {
    if (!smijeUredivati) notFound();
    return (
      <Stranica sirina="3xl">
        <NaslovStranice naslov="Nova uloga" akcije={<GumbVeza href="/uloge">Natrag</GumbVeza>} />
        <Kartica>
          <ObrazacUloge id={null} naziv="" opis="" prava={praznaPrava()} samoPregled={false} />
        </Kartica>
      </Stranica>
    );
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const u = await uloga(k.db, k.firmaId, id);
  if (!u) notFound();
  const samoPregled = !smijeUredivati || u.sustavna;

  return (
    <Stranica sirina="3xl">
      <NaslovStranice naslov={u.naziv} opis={`${u.brojKorisnika} korisnika`} akcije={<GumbVeza href="/uloge">Natrag</GumbVeza>} />
      {u.sustavna && <Obavijest vrsta="info">Uloga Administrator ima sva prava i ne može se mijenjati.</Obavijest>}
      <Kartica>
        <ObrazacUloge id={u.id} naziv={u.naziv} opis={u.opis} prava={u.prava} samoPregled={samoPregled} />
      </Kartica>
      {!samoPregled && (
        <Kartica naslov="Brisanje">
          <ObrisiUlogu id={u.id} />
        </Kartica>
      )}
    </Stranica>
  );
}
