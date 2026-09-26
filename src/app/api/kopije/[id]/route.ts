import { jeUuid } from "@/domain/id";
import { AKCIJE } from "@/lib/akcije-prava";
import { pristupApi } from "@/lib/akcija";
import { db } from "@/lib/db";
import { zapisiDnevnik } from "@/services/dnevnik";

export const dynamic = "force-dynamic";

/** GET /api/kopije/<id> — preuzimanje kopije (gzip NDJSON); svako preuzimanje ide u dnevnik. */
export async function GET(_r: Request, ctx: RouteContext<"/api/kopije/[id]">) {
  const k = await pristupApi(AKCIJE["kopije.vrati"]);
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  const kopija = jeUuid(id)
    ? await db.sigurnosnaKopija.findUnique({ where: { firmaId_id: { firmaId: k.firmaId, id } }, include: { firma: { select: { oib: true } } } })
    : null;
  if (!kopija) return Response.json({ greska: "Kopija ne postoji." }, { status: 404 });
  await zapisiDnevnik(db, {
    firmaId: k.firmaId,
    korisnikId: k.korisnikId,
    radnja: "kopije.preuzimanje",
    entitet: "SigurnosnaKopija",
    entitetId: kopija.id,
    opis: `Preuzeta sigurnosna kopija od ${kopija.vrijeme.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    ip: k.ip,
  });
  const ime = `kopija-${kopija.firma.oib}-${kopija.vrijeme.toISOString().slice(0, 16).replace(/[T:]/g, "-")}.ndjson.gz`;
  return new Response(new Uint8Array(kopija.sadrzaj), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${ime}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
