import { db } from "@/lib/db";
import { tokenAgenta } from "@/lib/mdm-api";
import { aplikacijaZaAgenta } from "@/services/mdm-upravljanje";

export const dynamic = "force-dynamic";

// javna ruta: agent preuzima dodijeljenu aplikaciju tokenom uređaja
export async function GET(request: Request, ctx: RouteContext<"/api/mdm/aplikacije/[id]">) {
  const { id } = await ctx.params;
  const a = await aplikacijaZaAgenta(db, tokenAgenta(request), id);
  if (!a) return Response.json({ greska: "Aplikacija ne postoji." }, { status: 404 });
  return new Response(a.sadrzaj, {
    headers: {
      "Content-Type": a.platforma === "ANDROID" ? "application/vnd.android.package-archive" : "application/x-msi",
      "Content-Length": String(a.velicina),
      "Content-Disposition": `attachment; filename="${a.nazivDatoteke.replace(/[^\w.-]+/g, "_")}"`,
      "X-Sha256": a.sha256,
      "Cache-Control": "private, no-store",
    },
  });
}
