import Link from "next/link";
import { notFound } from "next/navigation";
import { GumbVeza } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { jeUuid } from "@/domain/id";
import { izvedeniPdvStatus, PDV_STATUSI } from "@/domain/partner";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { opcijeCjenika, partner } from "@/queries/partneri";
import { AkcijePartnera } from "../aktivnost";
import { ObrazacPartnera, type PocetniPartner } from "../obrazac";
import { Poslovnice } from "../poslovnice";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "Europe/Zagreb" });

export default async function Partner({ params }: PageProps<"/partneri/[id]">) {
  const { id } = await params;
  const k = await pristupStranici("/partneri");
  const smijeUredivati = imaPravo(k.prava, "partneri", "operativno");

  if (id === "novi") {
    if (!smijeUredivati) notFound();
    const pocetno: PocetniPartner = {
      naziv: "",
      kupac: true,
      dobavljac: false,
      drzava: "HR",
      oib: "",
      pdvBroj: "",
      adresa: "",
      postanskiBroj: "",
      mjesto: "",
      email: "",
      telefon: "",
      eRacunAdresa: "",
      pdvStatus: "",
      rokPlacanjaDana: "15",
      cjenikId: "",
      napomena: "",
    };
    return (
      <Stranica sirina="3xl">
        <NaslovStranice naslov="Novi partner" akcije={<GumbVeza href="/partneri">Natrag</GumbVeza>} />
        <Kartica>
          <ObrazacPartnera
            id={null}
            pocetno={pocetno}
            cjenici={await opcijeCjenika(k.db, k.firmaId)}
            izvedeniStatus={PDV_STATUSI.DOMACI}
            smijeUredivati
          />
        </Kartica>
      </Stranica>
    );
  }

  if (!jeUuid(id)) notFound();
  const p = await partner(k.db, k.firmaId, id);
  if (!p) notFound();
  const pocetno: PocetniPartner = {
    naziv: p.naziv,
    kupac: p.kupac,
    dobavljac: p.dobavljac,
    drzava: p.drzava,
    oib: p.oib ?? "",
    pdvBroj: p.pdvBroj ?? "",
    adresa: p.adresa ?? "",
    postanskiBroj: p.postanskiBroj ?? "",
    mjesto: p.mjesto ?? "",
    email: p.email ?? "",
    telefon: p.telefon ?? "",
    eRacunAdresa: p.eRacunAdresa ?? "",
    pdvStatus: p.pdvStatus ?? "",
    rokPlacanjaDana: String(p.rokPlacanjaDana),
    cjenikId: p.cjenikId ?? "",
    napomena: p.napomena ?? "",
  };

  return (
    <Stranica sirina="3xl">
      <NaslovStranice
        naslov={p.naziv}
        opis={
          <span className="inline-flex flex-wrap items-center gap-1">
            {p.kupac && <Znacka boja="plava">kupac</Znacka>}
            {p.dobavljac && <Znacka boja="zuta">dobavljač</Znacka>}
            <Znacka>{PDV_STATUSI[p.efektivniPdvStatus]}</Znacka>
            {p.viesValjan === true && <Znacka boja="zelena">VIES valjan {p.viesProvjereno ? datum.format(p.viesProvjereno) : ""}</Znacka>}
            {p.viesValjan === false && <Znacka boja="crvena">VIES: nije valjan</Znacka>}
          </span>
        }
        akcije={
          <>
            {imaPosebno(k.prava, "log") && <GumbVeza href={`/dnevnik?entitet=Partner&id=${p.id}`}>Povijest</GumbVeza>}
            <GumbVeza href="/partneri">Natrag</GumbVeza>
          </>
        }
      />
      {!p.aktivan && <Obavijest vrsta="upozorenje">Partner je deaktiviran — ne nudi se na novim dokumentima.</Obavijest>}
      <Kartica naslov="Podaci">
        <ObrazacPartnera
          id={p.id}
          pocetno={pocetno}
          cjenici={await opcijeCjenika(k.db, k.firmaId, p.cjenikId)}
          izvedeniStatus={PDV_STATUSI[izvedeniPdvStatus(p.drzava, p.pdvBroj)]}
          smijeUredivati={smijeUredivati}
        />
        {p.cjenik && (
          <p className="mt-3 text-sm">
            Cjenik:{" "}
            <Link href={`/cjenici/${p.cjenik.id}`} className="text-primarna hover:underline">
              {p.cjenik.naziv}
            </Link>
          </p>
        )}
      </Kartica>
      <Kartica naslov="Poslovnice">
        <Poslovnice partnerId={p.id} poslovnice={p.poslovnice} smijeUredivati={smijeUredivati} />
      </Kartica>
      {smijeUredivati && (
        <Kartica naslov="Radnje">
          <AkcijePartnera
            id={p.id}
            aktivan={p.aktivan}
            smijeBrisati={imaPravo(k.prava, "partneri", "puno")}
            imaPdvBroj={Boolean(p.pdvBroj || (p.drzava === "HR" && p.oib))}
          />
        </Kartica>
      )}
    </Stranica>
  );
}
