"use client";

import { useTransition, type ComponentProps } from "react";

/**
 * Obrazac za server akciju koji NE briše upisano kad spremanje ne uspije.
 * (React obrazac s `action={…}` nakon svakog slanja vraća polja na početne vrijednosti —
 * korisnik bi zbog jedne krive vrijednosti izgubio cijeli unos.)
 *
 *   const [stanje, posalji, uTijeku] = useActionState(akcijaNaPosluzitelju, undefined);
 *   <Obrazac akcija={posalji}>…</Obrazac>
 */
export function Obrazac({ akcija, children, ...props }: { akcija: (fd: FormData) => void } & Omit<ComponentProps<"form">, "action" | "onSubmit">) {
  const [, zapocni] = useTransition();
  return (
    <form
      {...props}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const gumb = (e.nativeEvent as SubmitEvent).submitter;
        if (gumb instanceof HTMLButtonElement && gumb.name) fd.set(gumb.name, gumb.value);
        zapocni(() => akcija(fd));
      }}
    >
      {children}
    </form>
  );
}
