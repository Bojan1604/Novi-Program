import { jeUuid } from "@/domain/id";
import { pristupApi } from "@/lib/akcija";

export const dynamic = "force-dynamic";

/** GET /api/mdm/snimke/<id> — snimka zaslona uređaja (za zaposlenike s pravom na MDM). */
export async function GET(_r: Request, ctx: RouteContext<"/api/mdm/snimke/[id]">) {
  const k = await pristupApi({ modul: "mdm", razina: "pregled" });
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  const s = jeUuid(id) ? await k.db.mdmSnimka.findFirst({ where: { id, firmaId: k.firmaId } }) : null;
  if (!s) return Response.json({ greska: "Snimka ne postoji." }, { status: 404 });
  return new Response(s.slika, {
    headers: {
      "Content-Type": s.vrsta,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    },
  });
}
