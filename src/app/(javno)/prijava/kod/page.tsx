import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sigurnaPutanja } from "@/domain/prijava";
import { KOLACIC_DRUGOG_KORAKA } from "@/lib/sesija";
import { ObrazacKoda } from "./obrazac";

export const metadata: Metadata = { title: "Kod za prijavu · ERP-WMS" };

export default async function KodPrijave({ searchParams }: PageProps<"/prijava/kod">) {
  const { dalje } = await searchParams;
  if (!(await cookies()).get(KOLACIC_DRUGOG_KORAKA)) redirect("/prijava");
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h1 className="mb-1 text-2xl font-semibold">Prijava u dva koraka</h1>
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
          Upišite 6-znamenkasti kod iz aplikacije za autentifikaciju ili jedan od rezervnih kodova.
        </p>
        <ObrazacKoda dalje={sigurnaPutanja(typeof dalje === "string" ? dalje : null)} />
        <Link href="/prijava" className="mt-4 block text-center text-sm text-neutral-500 hover:underline">
          Natrag na prijavu
        </Link>
      </div>
    </main>
  );
}
