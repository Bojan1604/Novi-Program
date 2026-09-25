import { db } from "@/lib/db";

// Nikad se ne sprema u predmemoriju i ne izvodi pri buildu.
export const dynamic = "force-dynamic";

/** GET /api/zdravlje — radi li program i je li baza dostupna. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ program: "u redu", baza: "u redu" });
  } catch (greska) {
    console.error("Provjera zdravlja: baza nije dostupna", greska);
    return Response.json({ program: "u redu", baza: "nedostupna" }, { status: 503 });
  }
}
