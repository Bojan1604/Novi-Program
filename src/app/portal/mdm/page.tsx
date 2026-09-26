import Link from "next/link";
import { Kartica, NaslovStranice, Znacka } from "@/components/ui/stranica";
import { VRSTE_ORGANIZACIJA, type VrstaOrganizacije } from "@/domain/mdm";
import { db } from "@/lib/db";
import { pristupPortalu } from "@/lib/portal";
import { vidljiveOrganizacijePartnera } from "@/services/mdm";

export const metadata = { title: "MDM · Portal klijenata" };
export const dynamic = "force-dynamic";

export default async function PortalMdm() {
  const k = await pristupPortalu();
  const org = await vidljiveOrganizacijePartnera(db, k.firmaId, k.partnerId);
  return (
    <>
      <NaslovStranice naslov="Upravljanje uređajima (MDM)" opis="Vaše organizacije i organizacije vaših klijenata." />
      <Kartica>
        {org.length === 0 ? (
          <p className="text-sm text-neutral-500">Nemate MDM organizacija.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="portal-mdm-organizacije">
            {org.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/portal/mdm/${o.id}`} className="font-medium text-primarna hover:underline">
                  {o.naziv}
                </Link>
                <span className="flex gap-1">
                  <Znacka>{VRSTE_ORGANIZACIJA[o.vrsta as VrstaOrganizacije]}</Znacka>
                  <Znacka boja="plava">uređaja {o._count.uredaji}</Znacka>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kartica>
    </>
  );
}
