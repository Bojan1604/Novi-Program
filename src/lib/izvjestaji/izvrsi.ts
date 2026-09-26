import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { granice, procitajRazdoblje, type Razdoblje } from "@/domain/izvjestaji";
import { jedan, sortiranje, vise, type ParametriUrl, type Sortiranje } from "@/domain/popis";
import { imaPosebno, type Prava } from "@/domain/prava";
import { zadovoljava } from "@/lib/akcije-prava";
import type { Izvjestaj, RezultatIzvjestaja } from "./tipovi";

export function smijeIzvjestaj(prava: Prava, iz: Izvjestaj): boolean {
  return iz.prava.every((p) => zadovoljava(prava, p));
}

export type Pokretanje = { razdoblje: Razdoblje; sort: Sortiranje<string>; rezultat: RezultatIzvjestaja };

/** Filtri iz URL-a (isti na ekranu i u izvozu), sortiranje samo po dopuštenim stupcima. */
export async function pokreni(
  iz: Izvjestaj,
  db: PrismaClient,
  firmaId: string,
  prava: Prava,
  sp: ParametriUrl,
  str: { skip: number; take: number },
  danas: string,
): Promise<Pokretanje> {
  const razdoblje = procitajRazdoblje(sp, danas);
  const g = iz.razdoblje ? granice(razdoblje) : { od: null, do: null };
  // stupci s nabavnim cijenama ne smiju ni sortirati bez prava „costs“ (redoslijed bi ih otkrio)
  const sortirajuci = iz.stupci.filter((s) => s.sort && (!s.osjetljivo || imaPosebno(prava, "costs"))).map((s) => s.kljuc);
  const sort = sortiranje(sp, sortirajuci, iz.zadanoSortiranje);
  const stupac = iz.stupci.find((s) => s.kljuc === sort.kljuc)!;
  const smjer = sort.smjer === "desc" ? Prisma.sql`DESC NULLS LAST` : Prisma.sql`ASC NULLS FIRST`;
  const trazi = iz.trazi ? (jedan(sp["trazi"])?.slice(0, 100) ?? null) : null;
  const viseF = Object.fromEntries((iz.vise ?? []).map((v) => [v.kljuc, vise(sp[v.kljuc]).slice(0, 50)]));
  const rezultat = await iz.upit(
    db,
    firmaId,
    { od: g.od, do: g.do, trazi, vise: viseF, prava, sort },
    { ...str, sort: Prisma.sql`${stupac.sort!} ${smjer}` },
  );
  return { razdoblje, sort, rezultat };
}
