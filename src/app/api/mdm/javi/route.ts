import { db } from "@/lib/db";
import { jsonAgenta, odgovorGreske, tokenAgenta } from "@/lib/mdm-api";
import { javiSe } from "@/services/mdm";

export const dynamic = "force-dynamic";

// javna ruta: agent se javlja tokenom uređaja (Authorization: Bearer), ne sesijom
/** POST /api/mdm/javi { izvjestaj } → { naredbe } */
export async function POST(request: Request) {
  try {
    const tijelo = (await jsonAgenta(request)) as { izvjestaj?: unknown } | null;
    const m = await javiSe(db, tokenAgenta(request), tijelo?.izvjestaj ?? {});
    if (!m) return Response.json({ greska: "Uređaj nije upisan ili je blokiran." }, { status: 401 });
    return Response.json({ naredbe: [] });
  } catch (g) {
    return odgovorGreske(g);
  }
}
