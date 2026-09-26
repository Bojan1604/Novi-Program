import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { ObrazacPostavki } from "./obrazac";

export const metadata = { title: "Postavke firme · ERP-WMS" };

export default async function Postavke() {
  const k = await pristupStranici("/postavke");
  const { smtpLozinka, ...f } = await db.firma.findUniqueOrThrow({ where: { id: k.firmaId } });
  return (
    <Stranica sirina="5xl">
      <NaslovStranice naslov="Postavke firme" opis={`${f.naziv} · OIB ${f.oib}`} />
      <Kartica>
        <ObrazacPostavki
          smije={imaPravo(k.prava, "postavke", "puno")}
          p={{ ...Object.fromEntries(Object.entries(f).map(([a, b]) => [a, b instanceof Date ? b.toISOString() : b])), imaLozinku: !!smtpLozinka }}
        />
      </Kartica>
    </Stranica>
  );
}
