import type { PotrebnoPravo } from "@/domain/prava";
import { pristupApi, type Kontekst } from "@/lib/akcija";
import { odabirModela, odabirPartnera, odabirUsluga } from "@/queries/partneri";

export const dynamic = "force-dynamic";

/** Pravo: dovoljno je JEDNO s popisa (npr. skladištar bira model na primci bez prava na šifrarnike). */
const IZVORI: Record<string, { prava: PotrebnoPravo[]; trazi: (k: Kontekst, upit: string, sp: URLSearchParams) => Promise<unknown[]> }> = {
  partneri: {
    prava: [
      { modul: "partneri", razina: "pregled" },
      { modul: "uredaji", razina: "operativno" },
      { modul: "nabava", razina: "operativno" },
    ],
    trazi: (k, q, sp) => {
      const v = sp.get("vrsta");
      return odabirPartnera(k.db, k.firmaId, q, v === "kupac" || v === "dobavljac" ? v : undefined);
    },
  },
  modeli: {
    prava: [
      { modul: "sifrarnici", razina: "pregled" },
      { modul: "uredaji", razina: "operativno" },
      { modul: "partneri", razina: "operativno" },
      { modul: "nabava", razina: "operativno" },
    ],
    trazi: (k, q) => odabirModela(k.db, k.firmaId, q),
  },
  usluge: {
    prava: [
      { modul: "sifrarnici", razina: "pregled" },
      { modul: "partneri", razina: "operativno" },
    ],
    trazi: (k, q) => odabirUsluga(k.db, k.firmaId, q),
  },
};

/** GET /api/odabir/<vrsta>?q=… — rezultati za pretraživač (odabir partnera, modela, usluge). */
export async function GET(request: Request, ctx: RouteContext<"/api/odabir/[vrsta]">) {
  const { vrsta } = await ctx.params;
  const izvor = Object.hasOwn(IZVORI, vrsta) ? IZVORI[vrsta] : undefined;
  if (!izvor) return Response.json({ greska: "Nepoznato." }, { status: 404 });
  let k: Kontekst | Response = Response.json({ greska: "Nemate pravo." }, { status: 403 });
  for (const pravo of izvor.prava) {
    k = await pristupApi(pravo);
    if (!(k instanceof Response) || k.status === 401) break;
  }
  if (k instanceof Response) return k;
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").slice(0, 100);
  if (!q.trim()) return Response.json([]);
  return Response.json(await izvor.trazi(k, q, sp));
}
