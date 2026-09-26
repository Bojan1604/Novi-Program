import { jeMjesec } from "@/domain/najam";
import { pristupApi } from "@/lib/akcija";
import { db } from "@/lib/db";
import { zapisiDnevnik } from "@/services/dnevnik";
import { zipZaKnjigovodju } from "@/services/knjigovodja";

export const dynamic = "force-dynamic";

/** GET /api/knjigovodja/zip?mjesec=YYYY-MM — paket za knjigovođu (bez nabavnih podataka za korisnika bez prava). */
export async function GET(request: Request) {
  const k = await pristupApi({ modul: "knjigovodja", razina: "pregled" });
  if (k instanceof Response) return k;
  const mjesec = new URL(request.url).searchParams.get("mjesec") ?? "";
  if (!jeMjesec(mjesec)) return Response.json({ greska: "Mjesec nije ispravan." }, { status: 400 });
  const z = await zipZaKnjigovodju(db, k, mjesec);
  await zapisiDnevnik(db, {
    firmaId: k.firmaId,
    korisnikId: k.korisnikId,
    ip: k.ip,
    radnja: "izvoz",
    entitet: "Izvoz",
    entitetId: "knjigovodja",
    opis: `ZIP za knjigovođu ${mjesec} (${z.izlaznih} izlaznih, ${z.ulaznih} ulaznih)`,
  });
  return new Response(new Uint8Array(z.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${z.naziv.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(z.naziv)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
