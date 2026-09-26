import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { ObrazacFiskalizacije, ObrazacPostavki } from "./obrazac";

export const metadata = { title: "Postavke firme · ERP-WMS" };

export default async function Postavke() {
  const k = await pristupStranici("/postavke");
  // tajne (lozinka pošte, certifikat i njegova lozinka) nikad ne idu pregledniku
  const {
    smtpLozinka,
    fiskalCertifikat,
    fiskalLozinka: _l,
    fiskalNacin,
    fiskalCertNaziv,
    fiskalCertVrijedi,
    ...f
  } = await db.firma.findUniqueOrThrow({
    where: { id: k.firmaId },
  });
  const smije = imaPravo(k.prava, "postavke", "puno");
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Postavke firme" opis={`${f.naziv} · OIB ${f.oib}`} />
      <Kartica>
        <ObrazacPostavki
          smije={smije}
          p={{ ...Object.fromEntries(Object.entries(f).map(([a, b]) => [a, b instanceof Date ? b.toISOString() : b])), imaLozinku: !!smtpLozinka }}
        />
      </Kartica>
      <Kartica naslov="Fiskalizacija">
        <ObrazacFiskalizacije
          smije={smije}
          nacin={fiskalNacin}
          certifikat={fiskalCertifikat && fiskalCertVrijedi ? { naziv: fiskalCertNaziv ?? "", vrijediDo: fiskalCertVrijedi.toISOString() } : null}
        />
      </Kartica>
    </Stranica>
  );
}
