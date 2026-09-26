import { db } from "@/lib/db";
import { adresaPosluzitelja, qrUpisa } from "@/lib/mdm-api";
import { pristupPortalApi } from "@/lib/portal";
import { organizacijaPartnera } from "@/services/mdm";

export const dynamic = "force-dynamic";

/** GET /portal/mdm/<id>/qr — QR upisa samo za organizaciju vidljivu partneru. */
export async function GET(request: Request, ctx: RouteContext<"/portal/mdm/[id]/qr">) {
  const k = await pristupPortalApi();
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  const o = await organizacijaPartnera(db, k.firmaId, k.partnerId, id);
  if (!o) return Response.json({ greska: "Organizacija ne postoji." }, { status: 404 });
  return qrUpisa(adresaPosluzitelja(request), o.kodUpisa);
}
