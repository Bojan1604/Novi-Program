import { pristupApi } from "@/lib/akcija";
import { db } from "@/lib/db";
import { GreskaKorisniku } from "@/lib/greske";
import { ublRacuna } from "@/services/eracun";

export const dynamic = "force-dynamic";

/** GET /api/prodaja/<id>/ubl — eRačun (UBL XML, HR CIUS) izdanog računa, s PDF-om u prilogu. */
export async function GET(_r: Request, ctx: RouteContext<"/api/prodaja/[id]/ubl">) {
  const k = await pristupApi({ modul: "prodaja", razina: "pregled" });
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  try {
    const r = await ublRacuna(db, k.firmaId, id);
    const ime = `eRacun-${r.broj.replace(/\//g, "-")}.xml`;
    return new Response(r.xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${ime}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof GreskaKorisniku) return Response.json({ greska: e.message }, { status: 404 });
    throw e;
  }
}
