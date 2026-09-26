import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterGodina, FilterRazdoblja, FilterVise, PoljePretrage } from "@/components/ui/filtri";
import { GumbVeza } from "@/components/ui/gumb";
import { GumbiIzvoza } from "@/components/ui/izvoz";
import { Kartica, NaslovStranice, Stranica } from "@/components/ui/stranica";
import { Stranicenje } from "@/components/ui/stranicenje";
import { Tablica } from "@/components/ui/tablica";
import { danas } from "@/domain/datum";
import { godineZaOdabir } from "@/domain/izvjestaji";
import { stranica, velicina } from "@/domain/popis";
import { imaPosebno } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { izvjestaj } from "@/lib/izvjestaji";
import { pokreni, smijeIzvjestaj } from "@/lib/izvjestaji/izvrsi";
import type { Redak } from "@/lib/izvjestaji/tipovi";
import { dopusteniStupci, tekstVrijednosti } from "@/lib/izvoz/stupci";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/izvjestaji/[kljuc]">) {
  const iz = izvjestaj((await params).kljuc);
  return { title: `${iz?.naziv ?? "Izvještaj"} · ERP-WMS` };
}

export default async function Izvjestaj({ params, searchParams }: PageProps<"/izvjestaji/[kljuc]">) {
  const k = await pristupStranici("/izvjestaji");
  const iz = izvjestaj((await params).kljuc);
  if (!iz || !smijeIzvjestaj(k.prava, iz)) notFound();
  const sp = await searchParams;
  const str = stranica(sp["stranica"]);
  const vel = velicina(sp["velicina"]);
  const dan = danas();
  const [{ sort, rezultat }, prvi, opcije] = await Promise.all([
    pokreni(iz, db, k.firmaId, k.prava, sp, { skip: (str - 1) * vel, take: vel }, dan),
    k.db.prodajniDokument.findFirst({ where: { firmaId: k.firmaId }, orderBy: { datum: "asc" }, select: { datum: true } }),
    Promise.all((iz.vise ?? []).map(async (v) => ({ ...v, lista: await v.opcije(db, k.firmaId) }))),
  ]);
  const stupci = dopusteniStupci(iz.stupci, imaPosebno(k.prava, "costs"));
  const ravni = Object.fromEntries(Object.entries(sp).map(([a, b]) => [a, Array.isArray(b) ? b.join(",") : b]));
  return (
    <Stranica sirina="7xl">
      <NaslovStranice
        naslov={iz.naziv}
        opis={iz.opis}
        akcije={
          <>
            <GumbiIzvoza izvor={`izvjestaj-${iz.kljuc}`} parametri={sp} />
            <GumbVeza href="/izvjestaji">Svi izvještaji</GumbVeza>
          </>
        }
      />
      <Kartica>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {iz.razdoblje && (
            <>
              <FilterGodina godine={godineZaOdabir(prvi ? prvi.datum.getUTCFullYear() : null, dan)} zadano={Number(dan.slice(0, 4))} />
              <FilterRazdoblja />
            </>
          )}
          {iz.trazi && <PoljePretrage placeholder={iz.trazi} />}
          {opcije.map((v) => (
            <FilterVise key={v.kljuc} oznaka={v.oznaka} parametar={v.kljuc} opcije={v.lista} />
          ))}
        </div>
        <Tablica
          testId="izvjestaj"
          putanja={`/izvjestaji/${iz.kljuc}`}
          parametri={sp}
          sort={sort}
          redovi={rezultat.redovi}
          kljucReda={(r) => stupci.map((s) => String(r[s.kljuc] ?? "")).join("|")}
          stupci={stupci.map((s) => ({
            kljuc: s.kljuc,
            naslov: s.naslov,
            ...(s.sort ? { sortira: s.kljuc } : {}),
            desno: s.vrsta === "iznos" || s.vrsta === "broj",
            prikaz: (r: Redak) => {
              const t = tekstVrijednosti(s.vrijednost(r), s.vrsta);
              const v = s.veza?.(r);
              return v ? (
                <Link href={v} className="text-primarna hover:underline">
                  {t}
                </Link>
              ) : (
                t
              );
            },
          }))}
          podnozje={stupci.map((s, i) => (i === 0 ? "Ukupno" : s.zbroj ? tekstVrijednosti(rezultat.zbroj[s.kljuc] ?? 0, s.vrsta) : ""))}
        />
        <div className="mt-3">
          <Stranicenje putanja={`/izvjestaji/${iz.kljuc}`} parametri={ravni} stranica={str} velicina={vel} ukupno={rezultat.ukupno} />
        </div>
      </Kartica>
    </Stranica>
  );
}
