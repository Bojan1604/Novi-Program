import { jeUuid } from "@/domain/id";
import { smijePrikazati, zaglavljeDatoteke } from "@/domain/prilozi";
import { pristupApi } from "@/lib/akcija";
import { PRAVA_PRILOGA, zadovoljava } from "@/lib/akcije-prava";

export const dynamic = "force-dynamic";

/** GET /api/prilozi/<id>[?preuzmi=1] — prilog uz zapis; pravo kao za pregled zapisa uz koji je. */
export async function GET(request: Request, ctx: RouteContext<"/api/prilozi/[id]">) {
  const k = await pristupApi({ samoPrijava: true });
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  if (!jeUuid(id)) return Response.json({ greska: "Prilog ne postoji." }, { status: 404 });
  const p = await k.db.prilog.findFirst({ where: { id, firmaId: k.firmaId } });
  const pravo = p && Object.hasOwn(PRAVA_PRILOGA, p.entitet) ? PRAVA_PRILOGA[p.entitet] : undefined;
  // bez prava isti odgovor kao da ne postoji (ne otkriva se postojanje tuđeg priloga)
  if (!p || !pravo || !zadovoljava(k.prava, pravo)) return Response.json({ greska: "Prilog ne postoji." }, { status: 404 });
  const prikazi = smijePrikazati(p.vrsta) && new URL(request.url).searchParams.get("preuzmi") !== "1";
  return new Response(p.sadrzaj, {
    headers: {
      "Content-Type": p.vrsta,
      "Content-Length": String(p.sadrzaj.byteLength),
      "Content-Disposition": zaglavljeDatoteke(p.naziv, prikazi),
      "X-Content-Type-Options": "nosniff",
      // PDF prikazuje preglednikov preglednik PDF-a (sandbox bi ga blokirao); ostalo bez skripti
      ...(p.vrsta === "application/pdf"
        ? {}
        : { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }),
      "Cache-Control": "private, no-store",
    },
  });
}
