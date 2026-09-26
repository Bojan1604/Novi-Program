import { db } from "@/lib/db";
import { tokenAgenta } from "@/lib/mdm-api";
import { datotekaZaAgenta } from "@/services/mdm-upravljanje";

export const dynamic = "force-dynamic";

// javna ruta: agent preuzima datoteku svoje organizacije tokenom uređaja
export async function GET(request: Request, ctx: RouteContext<"/api/mdm/datoteke/[id]">) {
  const { id } = await ctx.params;
  const d = await datotekaZaAgenta(db, tokenAgenta(request), id);
  if (!d) return Response.json({ greska: "Datoteka ne postoji." }, { status: 404 });
  return new Response(d.sadrzaj, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(d.velicina),
      "Content-Disposition": `attachment; filename="${d.naziv.replace(/[^\w.-]+/g, "_")}"`,
      "X-Sha256": d.sha256,
      "Cache-Control": "private, no-store",
    },
  });
}
