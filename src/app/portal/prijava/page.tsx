import { redirect } from "next/navigation";
import { trenutniKlijent } from "@/lib/portal";
import { ObrazacPrijavePortala } from "./obrazac";

export const metadata = { title: "Prijava · Portal klijenata" };

// javna stranica: prijava klijenta na portal
export default async function PrijavaPortala() {
  if (await trenutniKlijent()) redirect("/portal");
  return (
    <div className="flex flex-1 items-center justify-center py-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h1 className="mb-1 text-2xl font-semibold">Portal klijenata</h1>
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">Vaši uređaji, jamstva i servisni nalozi.</p>
        <ObrazacPrijavePortala />
      </div>
    </div>
  );
}
