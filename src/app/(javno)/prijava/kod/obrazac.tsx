"use client";

import { useActionState } from "react";
import { potvrdiKodAkcija, type StanjeKoda } from "../akcije";

export function ObrazacKoda({ dalje }: { dalje: string }) {
  const [stanje, akcija, uTijeku] = useActionState<StanjeKoda, FormData>(potvrdiKodAkcija, undefined);
  return (
    <form action={akcija} className="flex flex-col gap-4">
      <input type="hidden" name="dalje" value={dalje} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Kod</span>
        <input
          name="kod"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          maxLength={9}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-center text-lg tracking-widest text-neutral-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </label>
      {stanje?.greska && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {stanje.greska}
        </p>
      )}
      <button
        type="submit"
        disabled={uTijeku}
        className="rounded-md bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {uTijeku ? "Provjeravam…" : "Potvrdi"}
      </button>
    </form>
  );
}
