import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { danas } from "@/domain/datum";
import { nizoviBrojeva } from "@/services/postavke";
import { ObrazacBrojeva, ObrazacFiskalizacije, ObrazacLoga, ObrazacPostavki } from "./obrazac";

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
  const godina = Number(danas().slice(0, 4));
  const nizovi = nizoviBrojeva(f);
  const [logo, brojaci] = await Promise.all([
    f.logoId ? k.db.logoFirme.findFirst({ where: { firmaId: k.firmaId, id: f.logoId }, select: { vrsta: true, sadrzaj: true } }) : null,
    k.db.brojac.findMany({ where: { firmaId: k.firmaId, godina, vrsta: { in: nizovi.map((n) => n.vrsta) } }, select: { vrsta: true, zadnji: true } }),
  ]);
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Postavke firme" opis={`${f.naziv} · OIB ${f.oib}`} />
      <Kartica>
        <ObrazacPostavki
          smije={smije}
          p={{ ...Object.fromEntries(Object.entries(f).map(([a, b]) => [a, b instanceof Date ? b.toISOString() : b])), imaLozinku: !!smtpLozinka }}
        />
      </Kartica>
      <Kartica naslov="Logo na dokumentima">
        <ObrazacLoga smije={smije} logo={logo ? `data:${logo.vrsta};base64,${Buffer.from(logo.sadrzaj).toString("base64")}` : null} />
      </Kartica>
      <Kartica naslov="Brojevi dokumenata">
        <ObrazacBrojeva
          smije={smije}
          godina={godina}
          nizovi={nizovi.map((n) => ({ ...n, zadnji: brojaci.find((b) => b.vrsta === n.vrsta)?.zadnji ?? 0 }))}
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
