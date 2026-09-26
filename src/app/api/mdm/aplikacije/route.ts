import { AKCIJE } from "@/lib/akcije-prava";
import { pristupApi } from "@/lib/akcija";
import { db } from "@/lib/db";
import { GreskaKorisniku } from "@/lib/greske";
import { dodajAplikaciju, NAJVECA_APLIKACIJA } from "@/services/mdm-upravljanje";

export const dynamic = "force-dynamic";

/** POST /api/mdm/aplikacije (multipart: naziv, paket, platforma, verzija, verzijaKod, datoteka) — APK/MSI do 150 MB. */
export async function POST(request: Request) {
  const k = await pristupApi(AKCIJE["mdm.upravljanje"]);
  if (k instanceof Response) return k;
  if (Number(request.headers.get("content-length") ?? "0") > NAJVECA_APLIKACIJA + 1024 * 1024)
    return Response.json({ greska: "Datoteka je veća od 150 MB." }, { status: 413 });
  try {
    const fd = await request.formData();
    const f = fd.get("datoteka");
    if (!(f instanceof File)) throw new GreskaKorisniku("Odaberite datoteku.");
    const platforma = String(fd.get("platforma") ?? "");
    const id = await dodajAplikaciju(db, k, {
      naziv: String(fd.get("naziv") ?? ""),
      paket: String(fd.get("paket") ?? ""),
      platforma: platforma === "WINDOWS" ? "WINDOWS" : "ANDROID",
      verzija: String(fd.get("verzija") ?? ""),
      verzijaKod: Number(fd.get("verzijaKod") ?? "0"),
      datoteka: { naziv: f.name, sadrzaj: new Uint8Array(await f.arrayBuffer()) },
    });
    return Response.json({ ok: true, id });
  } catch (g) {
    if (g instanceof GreskaKorisniku) return Response.json({ ok: false, greska: g.message }, { status: 400 });
    throw g;
  }
}
