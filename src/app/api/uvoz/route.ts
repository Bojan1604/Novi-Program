import { danas } from "@/domain/datum";
import { jeAdministrator } from "@/domain/prava";
import { AKCIJE } from "@/lib/akcije-prava";
import { pristupApi } from "@/lib/akcija";
import { db } from "@/lib/db";
import { GreskaKorisniku } from "@/lib/greske";
import { pripremiUvoz, uvezi } from "@/services/uvoz";

export const dynamic = "force-dynamic";

const NAJVISE = 200 * 1024 * 1024;
/** u odgovoru najviše toliko poruka po vrsti (ostatak samo kao broj) */
const PORUKA = 500;

/** POST /api/uvoz (multipart: datoteka, korak = provjera | uvoz) — uvoz iz starog programa (docs/UVOZ.md). */
export async function POST(request: Request) {
  const k = await pristupApi(AKCIJE["uvoz.stari-program"]);
  if (k instanceof Response) return k;
  if (!jeAdministrator(k.prava)) return Response.json({ ok: false, greska: "Uvoz može pokrenuti samo administrator." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? "0") > NAJVISE + 1024 * 1024)
    return Response.json({ ok: false, greska: "Datoteka je veća od 200 MB." }, { status: 413 });
  try {
    const fd = await request.formData();
    const f = fd.get("datoteka");
    if (!(f instanceof File) || f.size === 0) throw new GreskaKorisniku("Odaberite JSON datoteku starog programa.");
    if (f.size > NAJVISE) throw new GreskaKorisniku("Datoteka je veća od 200 MB.");
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch {
      throw new GreskaKorisniku("Datoteka nije ispravan JSON.");
    }
    const r =
      fd.get("korak") === "uvoz" ? await uvezi(db, k, json, danas()) : { ...(await pripremiUvoz(db, k.firmaId, json, danas())), ugovoriGreske: [] };
    const { greske, upozorenja, brojevi, poGodinama, razlike, numeracija, ugovoriGreske } = r;
    return Response.json({
      ok: true,
      uvezeno: fd.get("korak") === "uvoz",
      greske: greske.slice(0, PORUKA),
      brojGresaka: greske.length,
      upozorenja: upozorenja.slice(0, PORUKA),
      brojUpozorenja: upozorenja.length,
      brojevi,
      poGodinama,
      razlike: razlike.slice(0, PORUKA),
      brojRazlika: razlike.length,
      numeracija,
      ugovoriGreske,
    });
  } catch (g) {
    if (g instanceof GreskaKorisniku) return Response.json({ ok: false, greska: g.message }, { status: 400 });
    throw g;
  }
}
