import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { smijeUpravljati } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { clan, popisUloga } from "@/queries/korisnici";
import { NovaLozinka, UrediKorisnika } from "../obrasci";

export default async function Korisnik({ params }: PageProps<"/korisnici/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/korisnici");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [c, uloge] = await Promise.all([clan(k.db, k.firmaId, id), popisUloga(k.db, k.firmaId)]);
  if (!c) notFound();

  const odluka = smijeUpravljati({ id: k.korisnikId, prava: k.prava }, { id, prava: c.prava });
  const smijeUredivati = odluka.dopusteno;
  const sebe = id === k.korisnikId;

  return (
    <Stranica sirina="3xl">
      <NaslovStranice naslov={c.korisnik.ime} opis={c.korisnik.email} akcije={<GumbVeza href="/korisnici">Natrag</GumbVeza>} />
      {!odluka.dopusteno && <Obavijest vrsta="info">{odluka.razlog} Podatke možete samo pregledati.</Obavijest>}
      {sebe && smijeUredivati && <Obavijest vrsta="info">Vlastitu ulogu i prava mijenja drugi administrator.</Obavijest>}
      <Kartica naslov="Podaci i prava">
        <UrediKorisnika
          korisnikId={id}
          ime={c.korisnik.ime}
          oib={c.korisnik.oib}
          aktivno={c.aktivno}
          ulogaId={c.ulogaId}
          uloge={uloge.map(({ id: uid, naziv }) => ({ id: uid, naziv }))}
          iznimke={c.iznimke}
          pravaUloge={c.pravaUloge}
          smijeUredivati={smijeUredivati}
        />
      </Kartica>
      {smijeUredivati && (
        <Kartica naslov="Nova lozinka">
          <NovaLozinka korisnikId={id} />
        </Kartica>
      )}
    </Stranica>
  );
}
