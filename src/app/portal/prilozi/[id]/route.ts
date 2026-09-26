import { smijePrikazati, zaglavljeDatoteke } from "@/domain/prilozi";
import { db } from "@/lib/db";
import { pristupPortalApi } from "@/lib/portal";
import { prilogKlijenta } from "@/queries/portal";

export const dynamic = "force-dynamic";

/** GET /portal/prilozi/<id> — samo JAVNI prilog naloga klijentovog partnera; interni ili tuđi → 404. */
export async function GET(request: Request, ctx: RouteContext<"/portal/prilozi/[id]">) {
  const k = await pristupPortalApi();
  if (k instanceof Response) return k;
  const { id } = await ctx.params;
  const p = await prilogKlijenta(db, k, id);
  if (!p) return Response.json({ greska: "Prilog ne postoji." }, { status: 404 });
  const prikazi = smijePrikazati(p.vrsta) && new URL(request.url).searchParams.get("preuzmi") !== "1";
  return new Response(p.sadrzaj, {
    headers: {
      "Content-Type": p.vrsta,
      "Content-Length": String(p.sadrzaj.byteLength),
      "Content-Disposition": zaglavljeDatoteke(p.naziv, prikazi),
      "X-Content-Type-Options": "nosniff",
      ...(p.vrsta === "application/pdf"
        ? {}
        : { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }),
      "Cache-Control": "private, no-store",
    },
  });
}
