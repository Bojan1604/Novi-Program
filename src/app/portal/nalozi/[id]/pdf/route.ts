import { jeUuid } from "@/domain/id";
import { db } from "@/lib/db";
import { pristupPortalApi } from "@/lib/portal";
import { pdfNaloga, podaciNalogaPdf } from "@/lib/servis-pdf";

export const dynamic = "force-dynamic";

/** GET /portal/nalozi/<id>/pdf — otpremnica klijentu: samo nalog njegovog partnera, samo javni podaci. */
export async function GET(_r: Request, ctx: RouteContext<"/portal/nalozi/[id]/pdf">) {
  const k = await pristupPortalApi();
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  const d = jeUuid(id) ? await podaciNalogaPdf(db, k.firmaId, id, k.partnerId) : null;
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
