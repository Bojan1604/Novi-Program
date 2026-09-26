import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { imaPosebno, imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { db } from "@/lib/db";
import { provjeriDosljednost, VRSTE_NALAZA, type VrstaNalaza } from "@/services/dosljednost";
import { Popravi } from "./radnje";

export const metadata = { title: "Provjera dosljednosti · ERP-WMS" };
export const dynamic = "force-dynamic";

async function izmjeri(firmaId: string, vidiNabavne: boolean) {
  const pocetak = performance.now();
  const nalazi = await provjeriDosljednost(db, firmaId, { vidiNabavne });
  return { nalazi, trajanje: Math.round(performance.now() - pocetak) };
}

export default async function Provjera() {
  const k = await pristupStranici("/provjera");
  const { nalazi, trajanje } = await izmjeri(k.firmaId, imaPosebno(k.prava, "costs"));
  const popravljivih = nalazi.filter((n) => n.popravljivo).length;
  const vrste = (Object.keys(VRSTE_NALAZA) as VrstaNalaza[]).map((v) => ({ v, l: nalazi.filter((n) => n.vrsta === v) }));
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="Provjera dosljednosti"
        opis={`Uspoređuje zapisane količine, vrijednosti i uplate sa stvarnim stanjem te stanja uređaja. Provjera je trajala ${trajanje} ms.`}
      />
      <Kartica>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm" data-testid="sazetak">
            {nalazi.length === 0 ? "Sve je dosljedno." : `Odstupanja: ${nalazi.length} (popravljivih ${popravljivih}).`}
          </p>
          {imaPravo(k.prava, "postavke", "puno") && popravljivih > 0 && <Popravi broj={popravljivih} />}
        </div>
      </Kartica>
      {vrste.map(({ v, l }) => (
        <Kartica key={v}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{VRSTE_NALAZA[v]}</h2>
            <Znacka boja={l.length === 0 ? "zelena" : l[0]!.popravljivo ? "zuta" : "crvena"}>
              {l.length === 0 ? "u redu" : `${l.length}${l[0]!.popravljivo ? "" : " · ručno"}`}
            </Znacka>
          </div>
          {l.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm break-words text-neutral-700 dark:text-neutral-300">
              {l.slice(0, 50).map((n) => (
                <li key={n.id}>{n.opis}</li>
              ))}
              {l.length > 50 && <li className="text-neutral-500">… i još {l.length - 50}</li>}
            </ul>
          )}
        </Kartica>
      ))}
    </Stranica>
  );
}
