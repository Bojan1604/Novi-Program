import { zahtijevajPrijavu } from "@/lib/sesija";
import { odjaviSe } from "./akcije";

export default async function ProgramLayout({ children }: LayoutProps<"/">) {
  const sesija = await zahtijevajPrijavu();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="min-w-0">
          <div className="font-semibold">ERP-WMS</div>
          <div className="truncate text-sm text-neutral-600 dark:text-neutral-400" data-testid="firma">
            {sesija.firma.naziv}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm sm:inline" data-testid="korisnik">
            {sesija.korisnik.ime}
          </span>
          <form action={odjaviSe}>
            <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">
              Odjava
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
