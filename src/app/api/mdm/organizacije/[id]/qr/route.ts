import { jeUuid } from "@/domain/id";
import { pristupApi } from "@/lib/akcija";
import { adresaPosluzitelja, qrUpisa } from "@/lib/mdm-api";

export const dynamic = "force-dynamic";

/** GET /api/mdm/organizacije/<id>/qr — QR za upis uređaja u organizaciju. */
export async function GET(request: Request, ctx: RouteContext<"/api/mdm/organizacije/[id]/qr">) {
  const k = await pristupApi({ modul: "mdm", razina: "pregled" });
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  const o = jeUuid(id) ? await k.db.mdmOrganizacija.findFirst({ where: { id, firmaId: k.firmaId }, select: { kodUpisa: true } }) : null;
  if (!o) return Response.json({ greska: "Organizacija ne postoji." }, { status: 404 });
  return qrUpisa(adresaPosluzitelja(request), o.kodUpisa);
}
