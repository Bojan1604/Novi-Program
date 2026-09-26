import { jeUuid } from "@/domain/id";
import { pristupApi } from "@/lib/akcija";
import { db } from "@/lib/db";
import { pdfNaloga, podaciNalogaPdf } from "@/lib/servis-pdf";

export const dynamic = "force-dynamic";

/** GET /api/servis/<id>/pdf — servisni nalog / otpremnica. */
export async function GET(_r: Request, ctx: RouteContext<"/api/servis/[id]/pdf">) {
  const k = await pristupApi({ modul: "servis", razina: "pregled" });
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  const d = jeUuid(id) ? await podaciNalogaPdf(db, k.firmaId, id) : null;
  if (!d) return Response.json({ greska: "Nalog ne postoji." }, { status: 404 });
  const pdf = await pdfNaloga(d);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${d.broj.replace(/[^\w.-]+/g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
