import { procitajUpis } from "@/domain/mdm";
import { db } from "@/lib/db";
import { jsonAgenta, odgovorGreske } from "@/lib/mdm-api";
import { podaciZahtjeva } from "@/lib/sesija";
import { upisiUredaj } from "@/services/mdm";

export const dynamic = "force-dynamic";

// javna ruta: agent (Android/Windows) upisuje uređaj kodom upisa organizacije — još nema token
/** POST /api/mdm/upis { kod, serijski, platforma, naziv?, model?, osVerzija?, verzijaAgenta? } → { uredajId, token } */
export async function POST(request: Request) {
  try {
    const r = procitajUpis(await jsonAgenta(request));
    if (!r.ok) return Response.json({ greska: r.greska }, { status: 400 });
    const { ip } = await podaciZahtjeva();
    const u = await upisiUredaj(db, r.vrijednost, ip);
    return Response.json({ uredajId: u.id, token: u.token });
  } catch (g) {
    return odgovorGreske(g);
  }
}
