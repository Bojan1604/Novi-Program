import { pristupApi } from "@/lib/akcija";
import { komponenteUkljucene, TESTNI_PARTNERI } from "@/lib/razvoj";

export const dynamic = "force-dynamic";

/** Testni izvor za pretraživač: kratki upiti odgovaraju SPORO (da se provjeri odbacivanje kasnih odgovora). */
export async function GET(request: Request) {
  if (!komponenteUkljucene()) return new Response(null, { status: 404 });
  const k = await pristupApi({ samoPrijava: true });
  if (k instanceof Response) return k;
  const q = (new URL(request.url).searchParams.get("q") ?? "").toLowerCase();
  await new Promise((r) => setTimeout(r, q.length <= 2 ? 900 : 30));
  return Response.json(TESTNI_PARTNERI.filter((p) => p.naziv.toLowerCase().includes(q)).slice(0, 20));
}
