import { db } from "@/lib/db";
import { citajTijelo, odgovorGreske, tokenAgenta } from "@/lib/mdm-api";
import { agentPoTokenu } from "@/services/mdm";
import { NAJVECA_SNIMKA, snimkaAgenta } from "@/services/mdm-upravljanje";

export const dynamic = "force-dynamic";

// javna ruta: agent šalje snimku zaslona (PNG/JPEG u tijelu) tokenom uređaja; X-Naredba = id naredbe
export async function POST(request: Request) {
  try {
    const token = tokenAgenta(request);
    // prvo token, pa tek onda čitanje tijela (neprijavljeni ne mogu slati velike zahtjeve)
    if (!(await agentPoTokenu(db, token))) return Response.json({ greska: "Uređaj nije upisan ili je blokiran." }, { status: 401 });
    const slika = await citajTijelo(request, NAJVECA_SNIMKA);
    const ok = await snimkaAgenta(db, token, request.headers.get("x-naredba"), slika);
    return ok ? Response.json({ ok: true }) : Response.json({ greska: "Uređaj nije upisan ili je blokiran." }, { status: 401 });
  } catch (g) {
    return odgovorGreske(g);
  }
}
