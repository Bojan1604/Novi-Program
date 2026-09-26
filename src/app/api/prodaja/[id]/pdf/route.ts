import { pristupApi } from "@/lib/akcija";
import { pdfDokumenta } from "@/lib/pdf-dokumenta";
import { podaciZaPdf } from "@/queries/prodaja-pdf";

export const dynamic = "force-dynamic";

/** GET /api/prodaja/<id>/pdf — PDF ponude, predračuna, računa, storna, odobrenja, predujma. */
export async function GET(_r: Request, ctx: RouteContext<"/api/prodaja/[id]/pdf">) {
  const k = await pristupApi({ modul: "prodaja", razina: "pregled" });
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  const r = await podaciZaPdf(k.db, k.firmaId, id);
  if (!r) return Response.json({ greska: "Dokument ne postoji." }, { status: 404 });
  const pdf = await pdfDokumenta(r.podaci);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${r.datoteka.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(r.datoteka)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
