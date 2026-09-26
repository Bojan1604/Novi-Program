import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { Tablica } from "@/components/ui/tablica";
import { jeUuid } from "@/domain/id";
import { formatirajIznos } from "@/domain/novac";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { cjenik } from "@/queries/partneri";
import { NovaCijena, ObrazacCjenika, UkloniCijenu } from "../obrasci";

export default async function Cjenik({ params }: PageProps<"/cjenici/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/cjenici");
  const smijeUredivati = imaPravo(k.prava, "partneri", "operativno");
  if (id === "novi") {
    if (!smijeUredivati) notFound();
    return (
      <Stranica sirina="3xl">
        <NaslovStranice naslov="Novi cjenik" akcije={<GumbVeza href="/cjenici">Natrag</GumbVeza>} />
        <Kartica>
          <ObrazacCjenika id={null} naziv="" opis="" popust={null} aktivan smijeUredivati />
        </Kartica>
      </Stranica>
    );
  }
  if (!jeUuid(id)) notFound();
  const c = await cjenik(k.db, k.firmaId, id);
  if (!c) notFound();
  return (
    <Stranica>
      <NaslovStranice naslov={c.naziv} opis={c.opis} akcije={<GumbVeza href="/cjenici">Natrag</GumbVeza>} />
      <Kartica naslov="Cjenik">
        <ObrazacCjenika id={c.id} naziv={c.naziv} opis={c.opis ?? ""} popust={c.popust} aktivan={c.aktivan} smijeUredivati={smijeUredivati} />
      </Kartica>
      <Kartica naslov="Cijene">
        {smijeUredivati && (
          <div className="mb-4">
            <NovaCijena cjenikId={c.id} />
          </div>
        )}
        <Tablica
          testId="stavke-cjenika"
          putanja={`/cjenici/${c.id}`}
          parametri={{}}
          redovi={c.stavke}
          kljucReda={(s) => s.id}
          prazno="Nema posebnih cijena."
          stupci={[
            { kljuc: "naziv", naslov: "Model / usluga", prikaz: (s) => s.naziv },
            { kljuc: "vrsta", naslov: "Vrsta", prikaz: (s) => s.vrsta },
            { kljuc: "osnovna", naslov: "Osnovna cijena", desno: true, prikaz: (s) => (s.osnovna === null ? "" : `${formatirajIznos(s.osnovna)} €`) },
            { kljuc: "cijena", naslov: "Cijena u cjeniku", desno: true, prikaz: (s) => `${formatirajIznos(s.cijena)} €` },
            ...(smijeUredivati
              ? [
                  {
                    kljuc: "ukloni",
                    naslov: "",
                    prikaz: (s: (typeof c.stavke)[number]) => (
                      <UkloniCijenu cjenikId={c.id} vrsta={s.modelId ? "model" : "usluga"} artiklId={(s.modelId ?? s.uslugaId)!} />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Kartica>
      {c.partneri.length > 0 && (
        <Kartica naslov="Kupci s ovim cjenikom">
          <ul className="flex flex-wrap gap-2 text-sm">
            {c.partneri.map((p) => (
              <li key={p.id}>
                <Link href={`/partneri/${p.id}`} className="text-primarna-slova hover:underline">
                  {p.naziv}
                </Link>
              </li>
            ))}
          </ul>
        </Kartica>
      )}
    </Stranica>
  );
}
