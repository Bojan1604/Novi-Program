import { ObrazacLozinke } from "./obrazac";

export const metadata = { title: "Lozinka · Portal klijenata", referrer: "no-referrer" };

// javna stranica: postavljanje lozinke klijenta preko jednokratne poveznice (token se provjerava pri spremanju)
export default async function LozinkaPortala({ params }: PageProps<"/portal/lozinka/[token]">) {
  const { token } = await params;
  return (
    <div className="flex flex-1 items-center justify-center py-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h1 className="mb-1 text-2xl font-semibold">Lozinka za portal</h1>
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">Postavite lozinku za pristup portalu klijenata.</p>
        <ObrazacLozinke token={token.slice(0, 200)} />
      </div>
    </div>
  );
}
