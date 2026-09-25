import { redirect } from "next/navigation";
import { BocniIzbornik, MobilniIzbornik, type StavkaNav } from "@/components/okvir/navigacija";
import { izbornikZa } from "@/domain/izbornik";
import { trenutniKontekst } from "@/lib/akcija";
import { IZBORNIK } from "@/lib/izbornik";
import { odjaviSe } from "./akcije";

export default async function ProgramLayout({ children }: LayoutProps<"/">) {
  const k = await trenutniKontekst();
  if (!k) redirect("/prijava");
  const stavke: StavkaNav[] = izbornikZa(k.prava, IZBORNIK).map(({ naziv, putanja, grupa }) => ({ naziv, putanja, grupa }));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 bg-pozadina px-4 py-2.5 dark:border-neutral-800">
        <div className="flex min-w-0 items-center gap-3">
          <MobilniIzbornik stavke={stavke} />
          <div className="min-w-0">
            <div className="font-semibold">ERP-WMS</div>
            <div className="truncate text-xs text-neutral-600 dark:text-neutral-400" data-testid="firma">
              {k.sesija.firma.naziv}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm sm:inline" data-testid="korisnik">
            {k.sesija.korisnik.ime}
          </span>
          <form action={odjaviSe}>
            <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
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
    </div>
  );
}
