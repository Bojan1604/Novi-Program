"use client";

import { useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Polje } from "@/components/ui/polje";
import { Znacka } from "@/components/ui/stranica";
import { iskljuciDvaKorakaAkcija, potvrdiDvaKorakaAkcija, rezervniKodoviAkcija, zapocniDvaKorakaAkcija, type OdgovorDvaKoraka } from "./akcije";

function Kodovi({ kodovi }: { kodovi: string[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
      <span>Rezervni kodovi — spremite ih (svaki vrijedi jednom, prikazuju se samo sada):</span>
      <ul className="grid grid-cols-2 gap-1 font-mono" data-testid="rezervni-kodovi">
        {kodovi.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    </div>
  );
}

export function DvaKoraka({ ukljucen, preostaloRezervnih }: { ukljucen: boolean; preostaloRezervnih: number }) {
  const [lozinka, setLozinka] = useState("");
  const [kod, setKod] = useState("");
  const [s, setS] = useState<OdgovorDvaKoraka | null>(null);
  const [postava, setPostava] = useState<{ tajna: string; qr: string } | null>(null);
  const [uTijeku, zapocni] = useTransition();
  const radi = (fn: () => Promise<OdgovorDvaKoraka>) =>
    zapocni(async () => {
      const r = await fn();
      setS(r);
      if (r.ok && r.tajna && r.qr) setPostava({ tajna: r.tajna, qr: r.qr });
      if (r.ok && r.kodovi) setPostava(null);
      if (r.ok) {
        setLozinka("");
        setKod("");
      }
    });
  return (
    <div className="flex flex-col gap-3" data-testid="dva-koraka">
      <p className="text-sm">
        Stanje: {ukljucen ? <Znacka boja="zelena">uključena · rezervnih kodova {preostaloRezervnih}</Znacka> : <Znacka>isključena</Znacka>}
      </p>
      {postava ? (
        <div className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR kao data URL */}
          <img
            src={postava.qr}
            alt="QR za aplikaciju za autentifikaciju"
            width={200}
            height={200}
            className="rounded border border-neutral-200 bg-white"
          />
          <p className="text-sm break-all">
            Ili upišite ključ ručno: <code data-testid="totp-tajna">{postava.tajna}</code>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Polje oznaka="Kod iz aplikacije" value={kod} onChange={(e) => setKod(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
            <Gumb varijanta="primarni" disabled={uTijeku || !kod} onClick={() => radi(() => potvrdiDvaKorakaAkcija(kod))}>
              Potvrdi i uključi
            </Gumb>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <Polje oznaka="Lozinka" type="password" autoComplete="current-password" value={lozinka} onChange={(e) => setLozinka(e.target.value)} />
          {ukljucen && <Polje oznaka="Kod (za isključivanje)" value={kod} onChange={(e) => setKod(e.target.value)} inputMode="numeric" />}
          {!ukljucen && (
            <Gumb varijanta="primarni" disabled={uTijeku || !lozinka} onClick={() => radi(() => zapocniDvaKorakaAkcija(lozinka))}>
              Uključi prijavu u dva koraka
            </Gumb>
          )}
          {ukljucen && (
            <>
              <Gumb disabled={uTijeku || !lozinka} onClick={() => radi(() => rezervniKodoviAkcija(lozinka))}>
                Novi rezervni kodovi
              </Gumb>
              <Gumb varijanta="opasni" disabled={uTijeku || !lozinka || !kod} onClick={() => radi(() => iskljuciDvaKorakaAkcija(lozinka, kod))}>
                Isključi
              </Gumb>
            </>
          )}
        </div>
      )}
      {s && (s.ok ? <Obavijest vrsta="uspjeh">{s.poruka}</Obavijest> : <Obavijest vrsta="greska">{s.greska}</Obavijest>)}
      {s?.ok && s.kodovi && <Kodovi kodovi={s.kodovi} />}
    </div>
  );
}
