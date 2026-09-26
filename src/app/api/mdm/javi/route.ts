import { db } from "@/lib/db";
import { jsonAgenta, odgovorGreske, tokenAgenta } from "@/lib/mdm-api";
import { agentPoTokenu } from "@/services/mdm";
import { javljanjeAgenta } from "@/services/mdm-upravljanje";

export const dynamic = "force-dynamic";

// javna ruta: agent se javlja tokenom uređaja (Authorization: Bearer), ne sesijom
/** POST /api/mdm/javi { izvjestaj } → { naredbe, profil, aplikacije, datoteke } */
export async function POST(request: Request) {
  try {
    if (!(await agentPoTokenu(db, tokenAgenta(request)))) return Response.json({ greska: "Uređaj nije upisan ili je blokiran." }, { status: 401 });
    const tijelo = (await jsonAgenta(request)) as { izvjestaj?: unknown } | null;
    const r = await javljanjeAgenta(db, tokenAgenta(request), tijelo?.izvjestaj ?? {});
    if (!r) return Response.json({ greska: "Uređaj nije upisan ili je blokiran." }, { status: 401 });
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (g) {
    return odgovorGreske(g);
  }
}
