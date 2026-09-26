import { db } from "@/lib/db";
import { odgovorGreske, tokenAgenta } from "@/lib/mdm-api";
import { NAJVECA_SNIMKA, snimkaAgenta } from "@/services/mdm-upravljanje";

export const dynamic = "force-dynamic";

// javna ruta: agent šalje snimku zaslona (PNG/JPEG u tijelu) tokenom uređaja; X-Naredba = id naredbe
export async function POST(request: Request) {
  try {
    const duljina = Number(request.headers.get("content-length") ?? "0");
    if (duljina > NAJVECA_SNIMKA) return Response.json({ greska: "Snimka je prevelika." }, { status: 413 });
    const slika = new Uint8Array(await request.arrayBuffer());
    const ok = await snimkaAgenta(db, tokenAgenta(request), request.headers.get("x-naredba"), slika);
    return ok ? Response.json({ ok: true }) : Response.json({ greska: "Uređaj nije upisan ili je blokiran." }, { status: 401 });
  } catch (g) {
    return odgovorGreske(g);
  }
}
