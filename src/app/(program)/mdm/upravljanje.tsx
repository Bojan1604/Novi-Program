"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Gumb } from "@/components/ui/gumb";
import { Obavijest } from "@/components/ui/obavijest";
import { Obrazac } from "@/components/ui/obrazac";
import { klaseUnosa, Kvacica, Odabir, Polje } from "@/components/ui/polje";
import { VRSTE_NAREDBI, type VrstaNaredbe } from "@/domain/mdm-upravljanje";
import type { Odgovor } from "@/lib/greske";
import { dodajDatotekuAkcija, dodjelaAkcija, naredbaAkcija, obrisiDatotekuAkcija, otkaziNaredbuAkcija, spremiProfilAkcija } from "./akcije";

type Opcija = { id: string; naziv: string };

function Poruka({ s }: { s: Odgovor | null | undefined }) {
  if (!s) return null;
  return s.ok ? <Obavijest vrsta="uspjeh">{s.poruka}</Obavijest> : <Obavijest vrsta="greska">{s.greska}</Obavijest>;
}

export type PocetniProfil = {
  naziv: string;
  organizacijaId: string;
  platforma: string;
  lozinkaMin: string;
  zakljucajNakonMin: string;
  kameraDopustena: boolean;
  usbDopusten: boolean;
  wifiSsid: string;
  imaWifiLozinku: boolean;
  kiosk: string;
  aktivan: boolean;
};

export function ObrazacProfila({ id, p, organizacije }: { id: string | null; p: PocetniProfil; organizacije: Opcija[] }) {
  const [stanje, posalji, uTijeku] = useActionState(spremiProfilAkcija.bind(null, id), undefined);
  return (
    <Obrazac akcija={posalji} className="flex flex-col gap-3" aria-label={id ? `Profil ${p.naziv}` : "Novi profil"}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Polje oznaka="Naziv" name="naziv" required defaultValue={p.naziv} />
        <Odabir oznaka="Platforma" name="platforma" defaultValue={p.platforma}>
          <option value="ANDROID">Android</option>
          <option value="WINDOWS">Windows</option>
        </Odabir>
        <Odabir oznaka="Za organizaciju" name="organizacijaId" defaultValue={p.organizacijaId}>
          <option value="">Sve (opći profil)</option>
          {organizacije.map((o) => (
            <option key={o.id} value={o.id}>
              {o.naziv}
            </option>
          ))}
        </Odabir>
        <Polje
          oznaka="Najmanja duljina lozinke zaslona"
          name="lozinkaMin"
          inputMode="numeric"
          defaultValue={p.lozinkaMin}
          opis="4–16, prazno = bez zahtjeva"
        />
        <Polje oznaka="Zaključaj nakon (min)" name="zakljucajNakonMin" inputMode="numeric" defaultValue={p.zakljucajNakonMin} />
        <Polje oznaka="Kiosk aplikacija (paket)" name="kiosk" defaultValue={p.kiosk} />
        <Polje oznaka="Wi-Fi mreža (SSID)" name="wifiSsid" defaultValue={p.wifiSsid} />
        <Polje
          oznaka="Wi-Fi lozinka"
          name="wifiLozinka"
          type="password"
          autoComplete="new-password"
          opis={p.imaWifiLozinku ? "Postavljena — prazno ostavlja postojeću." : "Nije postavljena."}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <Kvacica oznaka="Kamera dopuštena" name="kameraDopustena" defaultChecked={p.kameraDopustena} />
        <Kvacica oznaka="USB dopušten" name="usbDopusten" defaultChecked={p.usbDopusten} />
        {p.imaWifiLozinku && <Kvacica oznaka="Obriši Wi-Fi lozinku" name="obrisiWifi" />}
        {id && <Kvacica oznaka="Aktivan" name="aktivan" defaultChecked={p.aktivan} />}
      </div>
      <div>
        <Gumb type="submit" varijanta={id ? "sekundarni" : "primarni"} disabled={uTijeku}>
          {id ? "Spremi profil" : "Dodaj profil"}
        </Gumb>
      </div>
      <Poruka s={stanje} />
    </Obrazac>
  );
}

/** Učitavanje APK/MSI ide API rutom (do 150 MB), ne server akcijom. */
export function NovaAplikacija({ predlozak }: { predlozak?: { naziv: string; paket: string; platforma: string } }) {
  const router = useRouter();
  const [s, setS] = useState<Odgovor | null>(null);
  const [uTijeku, setUTijeku] = useState(false);
  return (
    <form
      aria-label="Nova aplikacija"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setUTijeku(true);
        void fetch("/api/mdm/aplikacije", { method: "POST", body: fd })
          .then(async (r) => (await r.json()) as { ok: boolean; greska?: string })
          .then((r) => {
            setS(
              r.ok
                ? { ok: true, poruka: "Aplikacija je dodana — uređaji s dodjelom dobivaju je pri sljedećem javljanju." }
                : { ok: false, greska: r.greska ?? "Greška." },
            );
            if (r.ok) router.refresh();
          })
          .catch(() => setS({ ok: false, greska: "Slanje nije uspjelo." }))
          .finally(() => setUTijeku(false));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Polje oznaka="Naziv" name="naziv" required defaultValue={predlozak?.naziv} />
        <Polje oznaka="Paket (npr. com.firma.app)" name="paket" required defaultValue={predlozak?.paket} />
        <Odabir oznaka="Platforma" name="platforma" defaultValue={predlozak?.platforma ?? "ANDROID"}>
          <option value="ANDROID">Android (APK)</option>
          <option value="WINDOWS">Windows (MSI)</option>
        </Odabir>
        <Polje oznaka="Verzija (npr. 2.1.0)" name="verzija" required />
        <Polje oznaka="Broj verzije (raste)" name="verzijaKod" inputMode="numeric" required />
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Datoteka (APK/MSI, do 150 MB)
          <input type="file" name="datoteka" accept=".apk,.msi" required className={klaseUnosa} />
        </label>
      </div>
      <div>
        <Gumb type="submit" varijanta="primarni" disabled={uTijeku}>
          {uTijeku ? "Šaljem…" : "Dodaj aplikaciju"}
        </Gumb>
      </div>
      <Poruka s={s} />
    </form>
  );
}

export function Dodjele({
  organizacijaId,
  dodijeljene,
  dostupne,
}: {
  organizacijaId: string;
  dodijeljene: { paket: string; platforma: string; opis: string }[];
  dostupne: { paket: string; platforma: string; opis: string }[];
}) {
  const [s, setS] = useState<Odgovor | null>(null);
  const [odabir, setOdabir] = useState("");
  const [uTijeku, zapocni] = useTransition();
  const radi = (paket: string, platforma: string, dodijeli: boolean) =>
    zapocni(async () => setS(await dodjelaAkcija(organizacijaId, paket, platforma, dodijeli)));
  const ostale = dostupne.filter((d) => !dodijeljene.some((x) => x.paket === d.paket && x.platforma === d.platforma));
  return (
    <div className="flex flex-col gap-3">
      {dodijeljene.length === 0 ? (
        <p className="text-sm text-neutral-500">Nema dodijeljenih aplikacija.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="dodjele">
          {dodijeljene.map((d) => (
            <li key={`${d.paket}-${d.platforma}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="break-all">{d.opis}</span>
              <Gumb malen varijanta="tihi" disabled={uTijeku} onClick={() => radi(d.paket, d.platforma, false)}>
                Ukloni
              </Gumb>
            </li>
          ))}
        </ul>
      )}
      {ostale.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Odabir oznaka="Dodijeli aplikaciju" value={odabir} onChange={(e) => setOdabir(e.target.value)} className="min-w-0 flex-1">
            <option value="">— odaberite —</option>
            {ostale.map((d) => (
              <option key={`${d.paket}|${d.platforma}`} value={`${d.paket}|${d.platforma}`}>
                {d.opis}
              </option>
            ))}
          </Odabir>
          <Gumb
            disabled={uTijeku || !odabir}
            onClick={() => {
              const [paket, platforma] = odabir.split("|");
              radi(paket!, platforma!, true);
              setOdabir("");
            }}
          >
            Dodijeli
          </Gumb>
        </div>
      )}
      <Poruka s={s} />
    </div>
  );
}

export function DatotekeOrganizacije({
  organizacijaId,
  datoteke,
}: {
  organizacijaId: string;
  datoteke: { id: string; naziv: string; putanja: string; velicina: string }[];
}) {
  const [stanje, posalji, uTijeku] = useActionState(dodajDatotekuAkcija.bind(null, organizacijaId), undefined);
  const [s, setS] = useState<Odgovor | null>(null);
  const [brisem, zapocni] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {datoteke.length > 0 && (
        <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900" data-testid="mdm-datoteke">
          {datoteke.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="break-all">
                {d.naziv} → {d.putanja} <span className="text-neutral-500">({d.velicina})</span>
              </span>
              <Gumb
                malen
                varijanta="tihi"
                disabled={brisem}
                onClick={() => zapocni(async () => setS(await obrisiDatotekuAkcija(organizacijaId, d.id)))}
              >
                Obriši
              </Gumb>
            </li>
          ))}
        </ul>
      )}
      <Poruka s={s} />
      <Obrazac akcija={posalji} className="flex flex-col gap-2 sm:flex-row sm:items-end" aria-label="Nova datoteka za uređaje">
        <Polje oznaka="Mapa na uređaju" name="putanja" required placeholder="npr. Download ili C:\\ProgramData\\Firma" className="min-w-0 flex-1" />
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
          Datoteka (do 20 MB)
          <input type="file" name="datoteka" required className={klaseUnosa} />
        </label>
        <Gumb type="submit" disabled={uTijeku}>
          Pošalji uređajima
        </Gumb>
      </Obrazac>
      <Poruka s={stanje} />
    </div>
  );
}

export function NaredbaUredaju({ id, vrste, aplikacije }: { id: string; vrste: VrstaNaredbe[]; aplikacije: Opcija[] }) {
  const [stanje, posalji, uTijeku] = useActionState(naredbaAkcija.bind(null, id), undefined);
  const [vrsta, setVrsta] = useState<VrstaNaredbe>(vrste[0] ?? "ZAKLJUCAJ");
  return (
    <Obrazac
      akcija={(fd) => {
        if (vrsta !== "OBRISI_PODATKE" || confirm("Vratiti uređaj na tvorničke postavke? Svi podaci na uređaju se brišu.")) posalji(fd);
      }}
      className="flex flex-col gap-2"
      aria-label="Naredba uređaju"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Odabir oznaka="Naredba" name="vrsta" value={vrsta} onChange={(e) => setVrsta(e.target.value as VrstaNaredbe)}>
          {vrste.map((v) => (
            <option key={v} value={v}>
              {VRSTE_NAREDBI[v].naziv}
            </option>
          ))}
        </Odabir>
        {vrsta === "PORUKA" && <Polje oznaka="Tekst poruke" name="tekst" required maxLength={500} className="min-w-0 flex-1" />}
        {vrsta === "DEINSTALIRAJ" && <Polje oznaka="Paket" name="paket" required className="min-w-0 flex-1" />}
        {vrsta === "INSTALIRAJ" && (
          <Odabir oznaka="Aplikacija" name="aplikacijaId" required className="min-w-0 flex-1">
            {aplikacije.map((a) => (
              <option key={a.id} value={a.id}>
                {a.naziv}
              </option>
            ))}
          </Odabir>
        )}
        <Gumb type="submit" varijanta={vrsta === "OBRISI_PODATKE" ? "opasni" : "primarni"} disabled={uTijeku}>
          Pošalji
        </Gumb>
      </div>
      <Poruka s={stanje} />
    </Obrazac>
  );
}

export function OtkaziNaredbu({ uredajId, id }: { uredajId: string; id: string }) {
  const [s, setS] = useState<Odgovor | null>(null);
  const [uTijeku, zapocni] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Gumb malen varijanta="tihi" disabled={uTijeku} onClick={() => zapocni(async () => setS(await otkaziNaredbuAkcija(uredajId, id)))}>
        Otkaži
      </Gumb>
      {s && !s.ok && <span className="text-xs text-red-700">{s.greska}</span>}
    </span>
  );
}
