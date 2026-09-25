import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sigurnaPutanja } from "@/domain/prijava";
import { trenutnaSesija } from "@/lib/sesija";
import { ObrazacPrijave } from "./obrazac-prijave";

export const metadata: Metadata = { title: "Prijava · ERP-WMS" };

export default async function StranicaPrijave({ searchParams }: PageProps<"/prijava">) {
  const { dalje } = await searchParams;
  const povratak = sigurnaPutanja(typeof dalje === "string" ? dalje : null);
  if (await trenutnaSesija()) redirect(povratak);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h1 className="mb-1 text-2xl font-semibold">ERP-WMS</h1>
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">Prijavite se za nastavak.</p>
        <ObrazacPrijave dalje={povratak} />
      </div>
    </main>
  );
}
