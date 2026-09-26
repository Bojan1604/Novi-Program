import { db } from "@/lib/db";
import { jsonAgenta, odgovorGreske, tokenAgenta } from "@/lib/mdm-api";
import { agentPoTokenu } from "@/services/mdm";
import { rezultatNaredbe } from "@/services/mdm-upravljanje";

export const dynamic = "force-dynamic";

// javna ruta: agent javlja rezultat naredbe tokenom uređaja
/** POST /api/mdm/rezultat { naredbaId, uspjeh, poruka? } */
export async function POST(request: Request) {
  try {
    if (!(await agentPoTokenu(db, tokenAgenta(request)))) return Response.json({ greska: "Uređaj nije upisan ili je blokiran." }, { status: 401 });
    const t = (await jsonAgenta(request)) as Record<string, unknown> | null;
    const ok = await rezultatNaredbe(db, tokenAgenta(request), {
      naredbaId: String(t?.["naredbaId"] ?? ""),
      uspjeh: t?.["uspjeh"] === true,
      poruka: typeof t?.["poruka"] === "string" ? t["poruka"] : null,
    });
    return ok ? Response.json({ ok: true }) : Response.json({ greska: "Naredba ne postoji ili uređaj nije upisan." }, { status: 404 });
  } catch (g) {
    return odgovorGreske(g);
  }
}
