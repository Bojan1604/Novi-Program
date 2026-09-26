import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { BocniIzbornik, MobilniIzbornik, type StavkaNav } from "@/components/okvir/navigacija";
import { PrekidacTeme, type Tema } from "@/components/okvir/tema";
import { PorukeOkvir } from "@/components/ui/poruke";
import { varijableBoje } from "@/domain/boje";
import { izbornikZa } from "@/domain/izbornik";
import { trenutniKontekst } from "@/lib/akcija";
import { db } from "@/lib/db";
import { IZBORNIK } from "@/lib/izbornik";
import { mojeFirme } from "@/services/firme";
import { odjaviSe } from "./akcije";
import { OdabirFirme } from "./firme/obrasci";

export default async function ProgramLayout({ children }: LayoutProps<"/">) {
  const k = await trenutniKontekst();
  if (!k) redirect("/prijava");
  const stavke: StavkaNav[] = izbornikZa(k.prava, IZBORNIK).map(({ naziv, putanja, grupa }) => ({ naziv, putanja, grupa }));
  const [firma, firme] = await Promise.all([db.firma.findUnique({ where: { id: k.firmaId }, select: { boja: true } }), mojeFirme(db, k.korisnikId)]);
  const t = (await cookies()).get("tema")?.value;
  const tema: Tema = t === "tamna" || t === "svijetla" ? t : "sustav";

  return (
    <div className="flex min-h-full flex-1 flex-col" style={varijableBoje(firma?.boja) as CSSProperties}>
      <PorukeOkvir>
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 bg-pozadina px-4 py-2.5 dark:border-neutral-800">
          <div className="flex min-w-0 items-center gap-3">
            <MobilniIzbornik stavke={stavke} />
            <div className="min-w-0">
              <div className="font-semibold">ERP-WMS</div>
              {firme.length > 1 ? (
                <OdabirFirme firme={firme.map(({ id, naziv }) => ({ id, naziv }))} trenutna={k.firmaId} />
              ) : (
                <div className="truncate text-xs text-neutral-600 dark:text-neutral-400" data-testid="firma">
                  {k.sesija.firma.naziv}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <PrekidacTeme pocetna={tema} />
            <span className="hidden text-sm sm:inline" data-testid="korisnik">
              {k.sesija.korisnik.ime}
            </span>
            <form action={odjaviSe}>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Odjava
              </button>
            </form>
          </div>
        </header>
        <div className="flex flex-1">
          <aside className="hidden w-60 shrink-0 border-r border-neutral-200 p-3 lg:block dark:border-neutral-800">
            <BocniIzbornik stavke={stavke} />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </PorukeOkvir>
    </div>
  );
}
