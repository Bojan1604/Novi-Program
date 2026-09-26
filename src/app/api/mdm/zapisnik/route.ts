import { db } from "@/lib/db";
import { jsonAgenta, odgovorGreske, tokenAgenta } from "@/lib/mdm-api";
import { zapisnikAgenta } from "@/services/mdm-upravljanje";

export const dynamic = "force-dynamic";

// javna ruta: agent šalje zapisnik tokenom uređaja
/** POST /api/mdm/zapisnik { zapisi: [{ razina, poruka, vrijeme }] } */
export async function POST(request: Request) {
  try {
    const t = (await jsonAgenta(request)) as { zapisi?: unknown } | null;
    const n = await zapisnikAgenta(db, tokenAgenta(request), t?.zapisi);
    return n === null ? Response.json({ greska: "Uređaj nije upisan ili je blokiran." }, { status: 401 }) : Response.json({ spremljeno: n });
  } catch (g) {
    return odgovorGreske(g);
  }
}
