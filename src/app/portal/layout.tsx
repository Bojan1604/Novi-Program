import Link from "next/link";
import { trenutniKlijent } from "@/lib/portal";
import { odjavaPortalaAkcija } from "./akcije";

export const metadata = { title: "Portal klijenata" };

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const k = await trenutniKlijent();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-neutral-50 dark:bg-neutral-950">
      {k && (
        <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{k.firma.naziv} · portal</div>
              <div className="truncate text-xs text-neutral-500">
                {k.partner.naziv} · {k.korisnik.ime}
              </div>
            </div>
            <nav className="flex flex-wrap items-center gap-3 text-sm" aria-label="Portal">
              <Link href="/portal" className="hover:underline">
                Uređaji
              </Link>
              <form action={odjavaPortalaAkcija}>
                <button type="submit" className="text-neutral-600 hover:underline dark:text-neutral-300">
                  Odjava
                </button>
              </form>
            </nav>
          </div>
        </header>
      )}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6">{children}</main>
    </div>
  );
}
