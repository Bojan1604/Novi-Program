import { Kartica, Znacka } from "@/components/ui/stranica";
import { klaseGumba } from "@/components/ui/gumb";
import type { StatusERacuna } from "@/lib/eracun/posrednik";
import { provjeriUbl } from "@/lib/eracun/provjera";
import { ublXml } from "@/lib/eracun/ubl";
import { db } from "@/lib/db";
import { GreskaKorisniku } from "@/lib/greske";
import { jeUvezen, podaciZaUbl, STATUSI_ERACUNA } from "@/services/eracun";
import { OsvjeziStatus, PosaljiERacun } from "./eracun";

const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });
const BOJE: Record<StatusERacuna, "siva" | "zelena" | "crvena" | "plava" | "zuta"> = {
  SALJE: "zuta",
  POSLAN: "plava",
  ISPORUCEN: "plava",
  PRIHVACEN: "zelena",
  ODBIJEN: "crvena",
  GRESKA: "crvena",
};

/** eRačun izdanog računa: provjera (HR CIUS), slanje, status, UBL. */
export async function KarticaERacuna({ firmaId, dokumentId, smije }: { firmaId: string; dokumentId: string; smije: boolean }) {
  let greske: string[];
  let domaci = false;
  try {
    const r = await podaciZaUbl(db, firmaId, dokumentId, false);
    domaci = r.kupac.drzava === "HR" && !!r.kupac.oib;
    greske = provjeriUbl(ublXml(r));
  } catch (e) {
    if (!(e instanceof GreskaKorisniku)) throw e;
    greske = [e.message];
  }
  const slanja = await db.eRacun.findMany({
    where: { firmaId, dokumentId },
    orderBy: { poslano: "desc" },
    take: 10,
    select: { id: true, status: true, posrednik: true, poruka: true, korisnik: true, poslano: true, provjereno: true },
  });
  const zadnji = slanja[0];
  const uvezen = jeUvezen((await db.prodajniDokument.findFirst({ where: { id: dokumentId, firmaId }, select: { snimka: true } }))?.snimka);
  const moze = smije && !uvezen && domaci && greske.length === 0 && (!zadnji || ["ODBIJEN", "GRESKA"].includes(zadnji.status));
  return (
    <Kartica naslov="eRačun">
      <div className="flex flex-col gap-3 text-sm" data-testid="eracun">
        {zadnji ? (
          <p className="flex flex-wrap items-center gap-2">
            <Znacka boja={BOJE[zadnji.status as StatusERacuna]}>{STATUSI_ERACUNA[zadnji.status as StatusERacuna]}</Znacka>
            <span className="text-neutral-600 dark:text-neutral-400">
              {zadnji.posrednik} · poslao {zadnji.korisnik} {vrijeme.format(zadnji.poslano)}
              {zadnji.provjereno && ` · provjereno ${vrijeme.format(zadnji.provjereno)}`}
            </span>
            {zadnji.poruka && <span className="text-red-700 dark:text-red-400">{zadnji.poruka}</span>}
          </p>
        ) : uvezen ? (
          <p className="text-neutral-600 dark:text-neutral-400">Račun je uvezen iz starog programa — eRačun je poslan iz njega.</p>
        ) : !domaci && greske.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-400">Kupac nije hrvatski obveznik s OIB-om — račun se šalje e-poštom (PDF).</p>
        ) : (
          <p className="text-neutral-600 dark:text-neutral-400">eRačun još nije poslan.</p>
        )}
        {greske.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-red-700 dark:text-red-400" data-testid="greske-eracuna">
            {greske.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-start gap-2">
          {moze && <PosaljiERacun id={dokumentId} />}
          {smije && zadnji && !["ODBIJEN", "GRESKA", "PRIHVACEN"].includes(zadnji.status) && <OsvjeziStatus id={dokumentId} />}
          {greske.length === 0 && (
            <a href={`/api/prodaja/${dokumentId}/ubl`} className={klaseGumba()}>
              UBL (XML)
            </a>
          )}
        </div>
      </div>
    </Kartica>
  );
}
