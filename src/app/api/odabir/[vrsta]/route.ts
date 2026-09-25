import type { PotrebnoPravo } from "@/domain/prava";
import { pristupApi, type Kontekst } from "@/lib/akcija";
import { odabirModela, odabirPartnera, odabirUsluga } from "@/queries/partneri";

export const dynamic = "force-dynamic";

const IZVORI: Record<string, { pravo: PotrebnoPravo; trazi: (k: Kontekst, upit: string, sp: URLSearchParams) => Promise<unknown[]> }> = {
  partneri: {
    pravo: { modul: "partneri", razina: "pregled" },
    trazi: (k, q, sp) => {
      const v = sp.get("vrsta");
      return odabirPartnera(k.db, k.firmaId, q, v === "kupac" || v === "dobavljac" ? v : undefined);
    },
  },
  modeli: { pravo: { modul: "sifrarnici", razina: "pregled" }, trazi: (k, q) => odabirModela(k.db, k.firmaId, q) },
  usluge: { pravo: { modul: "sifrarnici", razina: "pregled" }, trazi: (k, q) => odabirUsluga(k.db, k.firmaId, q) },
};

/** GET /api/odabir/<vrsta>?q=… — rezultati za pretraživač (odabir partnera, modela, usluge). */
export async function GET(request: Request, ctx: RouteContext<"/api/odabir/[vrsta]">) {
  const { vrsta } = await ctx.params;
  const izvor = Object.hasOwn(IZVORI, vrsta) ? IZVORI[vrsta] : undefined;
  if (!izvor) return Response.json({ greska: "Nepoznato." }, { status: 404 });
  const k = await pristupApi(izvor.pravo);
  if (k instanceof Response) return k;
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").slice(0, 100);
  if (!q.trim()) return Response.json([]);
  return Response.json(await izvor.trazi(k, q, sp));
}
