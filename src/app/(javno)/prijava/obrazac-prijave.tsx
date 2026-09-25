"use client";

import { useActionState } from "react";
import { prijaviSe, type StanjePrijave } from "./akcije";

export function ObrazacPrijave({ dalje }: { dalje: string }) {
  const [stanje, akcija, uTijeku] = useActionState<StanjePrijave, FormData>(prijaviSe, undefined);

  return (
    <form action={akcija} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="dalje" value={dalje} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">E-pošta</span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          required
          autoFocus
          defaultValue={stanje?.email ?? ""}
          className="rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Lozinka</span>
        <input
          name="lozinka"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
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
        {uTijeku ? "Prijava…" : "Prijava"}
      </button>
    </form>
  );
}
