"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { Polje } from "@/components/ui/polje";
import { postaviLozinkuAkcija } from "./akcije";

export function ObrazacLozinke({ token }: { token: string }) {
  const [stanje, posalji, uTijeku] = useActionState(postaviLozinkuAkcija.bind(null, token), undefined);
  if (stanje?.ok)
    return (
      <div className="flex flex-col gap-3">
        <Obavijest vrsta="uspjeh">Lozinka je postavljena. Prijavite se s e-poštom {stanje.email}.</Obavijest>
        <Link href="/portal/prijava" className="text-primarna-slova hover:underline">
          Na prijavu
        </Link>
      </div>
    );
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label="Postavljanje lozinke">
      <Polje oznaka="Nova lozinka" name="lozinka" type="password" autoComplete="new-password" required opis="Najmanje 10 znakova." />
      <Polje oznaka="Ponovite lozinku" name="ponovljena" type="password" autoComplete="new-password" required />
      {stanje?.greska && <Obavijest vrsta="greska">{stanje.greska}</Obavijest>}
      <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
        Postavi lozinku
      </Gumb>
    </Obrazac>
  );
}
