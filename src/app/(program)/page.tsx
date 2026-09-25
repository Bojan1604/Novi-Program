import { zahtijevajPrijavu } from "@/lib/sesija";

export default async function Pocetna() {
  const sesija = await zahtijevajPrijavu();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-2 px-4 py-8">
      <h1 className="text-2xl font-semibold">Dobro došli, {sesija.korisnik.ime}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Prijavljeni ste kao {sesija.korisnik.email} · {sesija.firma.naziv}
      </p>
    </main>
  );
}
