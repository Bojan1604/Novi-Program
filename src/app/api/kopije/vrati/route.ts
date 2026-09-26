import { jeUuid } from "@/domain/id";
import { AKCIJE } from "@/lib/akcije-prava";
import { pristupApi } from "@/lib/akcija";
import { db } from "@/lib/db";
import { GreskaKorisniku } from "@/lib/greske";
import { vratiUNovuFirmu } from "@/services/kopije";

export const dynamic = "force-dynamic";

const NAJVISE = 500 * 1024 * 1024;

/** POST /api/kopije/vrati (multipart: naziv, oib i kopijaId ILI datoteka) — vraćanje kopije u novu firmu. */
export async function POST(request: Request) {
  const k = await pristupApi(AKCIJE["kopije.vrati"]);
  if (k instanceof Response) return k;
  if (Number(request.headers.get("content-length") ?? "0") > NAJVISE + 1024 * 1024)
    return Response.json({ ok: false, greska: "Datoteka je veća od 500 MB." }, { status: 413 });
  try {
    const fd = await request.formData();
    const kopijaId = String(fd.get("kopijaId") ?? "");
    const f = fd.get("datoteka");
    let sadrzaj: Uint8Array;
    if (f instanceof File && f.size > 0) {
      if (f.size > NAJVISE) throw new GreskaKorisniku("Datoteka je veća od 500 MB.");
      sadrzaj = new Uint8Array(await f.arrayBuffer());
    } else if (jeUuid(kopijaId)) {
      const kopija = await db.sigurnosnaKopija.findUnique({ where: { firmaId_id: { firmaId: k.firmaId, id: kopijaId } }, select: { sadrzaj: true } });
      if (!kopija) throw new GreskaKorisniku("Kopija ne postoji.");
      sadrzaj = kopija.sadrzaj;
    } else throw new GreskaKorisniku("Odaberite kopiju ili učitajte datoteku kopije.");
    const r = await vratiUNovuFirmu(db, k, sadrzaj, { naziv: String(fd.get("naziv") ?? ""), oib: String(fd.get("oib") ?? "") });
    return Response.json({ ok: true, firmaId: r.firmaId, redaka: r.redaka });
  } catch (g) {
    if (g instanceof GreskaKorisniku) return Response.json({ ok: false, greska: g.message }, { status: 400 });
    throw g;
  }
}
