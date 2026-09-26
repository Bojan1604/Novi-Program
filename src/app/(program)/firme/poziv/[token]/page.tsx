import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { pozivPoTokenu } from "@/services/firme";
import { OdgovorNaPoziv } from "../../obrasci";

export const metadata = { title: "Poziv u firmu · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function Poziv({ params }: PageProps<"/firme/poziv/[token]">) {
  const k = await pristupStranici("/firme");
  const { token } = await params;
  const p = await pozivPoTokenu(db, token);
  const zaMene = p && p.email === k.sesija.korisnik.email.toLowerCase();
  return (
    <Stranica sirina="3xl">
      <NaslovStranice naslov="Poziv u firmu" />
      <Kartica>
        {!p ? (
          <p className="text-sm">Poziv ne postoji ili je istekao. Zatražite novu poveznicu od administratora firme.</p>
        ) : !zaMene ? (
          <p className="text-sm">
            Poziv je poslan na drugu e-poštu. Odjavite se i prijavite računom <strong>{p.email}</strong>.
          </p>
        ) : (
          <div className="flex flex-col gap-3 text-sm" data-testid="poziv">
            <p>
              Firma <strong>{p.firma}</strong> poziva vas s ulogom <strong>{p.uloga}</strong> (poziv od: {p.pozvao}).
            </p>
            <OdgovorNaPoziv token={token} />
          </div>
        )}
      </Kartica>
    </Stranica>
  );
}
