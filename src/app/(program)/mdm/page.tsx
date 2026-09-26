import Link from "next/link";
import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { VRSTE_ORGANIZACIJA, type VrstaOrganizacije } from "@/domain/mdm";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { naVeziPoOrganizaciji } from "@/services/mdm";
import { ObrazacOrganizacije } from "./obrasci";

export const metadata = { title: "MDM · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function Mdm() {
  const k = await pristupStranici("/mdm");
  const [org, partneri, naVezi] = await Promise.all([
    k.db.mdmOrganizacija.findMany({
      where: { firmaId: k.firmaId },
      orderBy: { naziv: "asc" },
      select: {
        id: true,
        naziv: true,
        vrsta: true,
        nadredenaId: true,
        aktivna: true,
        partner: { select: { naziv: true } },
        _count: { select: { uredaji: true } },
      },
    }),
    k.db.partner.findMany({ where: { firmaId: k.firmaId, aktivan: true }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true }, take: 2000 }),
    naVeziPoOrganizaciji(db, k.firmaId),
  ]);
  const vezi = naVezi;
  // stablo: najviša razina, pa podređene ispod svoje nadređene
  const redovi = org
    .filter((o) => !o.nadredenaId)
    .flatMap((o) => [{ ...o, dubina: 0 }, ...org.filter((d) => d.nadredenaId === o.id).map((d) => ({ ...d, dubina: 1 }))]);
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="MDM"
        opis="Organizacije (distributeri i klijenti) i uređaji upisani kodom ili QR-om."
        akcije={
          <>
            <GumbVeza href="/mdm/aplikacije">Aplikacije</GumbVeza>
            <GumbVeza href="/mdm/profili">Profili</GumbVeza>
          </>
        }
      />
      <Kartica naslov="Organizacije">
        {redovi.length === 0 ? (
          <p className="text-sm text-neutral-500">Još nema organizacija.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="mdm-organizacije">
            {redovi.map((o) => (
              <li key={o.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${o.dubina ? "pl-5" : ""}`}>
                <div className="min-w-0">
                  <Link href={`/mdm/${o.id}`} className="font-medium text-primarna hover:underline">
                    {o.naziv}
                  </Link>{" "}
                  <span className="text-neutral-500">{o.partner ? `· ${o.partner.naziv}` : ""}</span>
                </div>
                <span className="flex flex-wrap gap-1">
                  <Znacka>{VRSTE_ORGANIZACIJA[o.vrsta as VrstaOrganizacije]}</Znacka>
                  <Znacka boja="plava">
                    uređaja {o._count.uredaji} · na vezi {vezi.get(o.id) ?? 0}
                  </Znacka>
                  {!o.aktivna && <Znacka boja="crvena">neaktivna</Znacka>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kartica>
      {imaPravo(k.prava, "mdm", "operativno") && (
        <Kartica naslov="Nova organizacija">
          <ObrazacOrganizacije
            id={null}
            pocetno={{ naziv: "", vrsta: "KLIJENT", nadredenaId: "", partnerId: "", aktivna: true }}
            distributeri={org.filter((o) => o.vrsta === "DISTRIBUTER" && !o.nadredenaId).map((o) => ({ id: o.id, naziv: o.naziv }))}
            partneri={partneri}
          />
        </Kartica>
      )}
    </Stranica>
  );
}
