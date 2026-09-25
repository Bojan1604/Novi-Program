import { danas } from "@/domain/datum";
import { imaPosebno } from "@/domain/prava";
import { pristupApi } from "@/lib/akcija";
import { db } from "@/lib/db";
import { uCsv } from "@/lib/izvoz/csv";
import { IZVORI, NAJVISE_REDAKA, type Format } from "@/lib/izvoz/izvori";
import { uPdfTablicu } from "@/lib/izvoz/pdf-tablica";
import { dopusteniStupci } from "@/lib/izvoz/stupci";
import { uXlsx } from "@/lib/izvoz/xlsx";
import { zapisiDnevnik } from "@/services/dnevnik";

export const dynamic = "force-dynamic";

const VRSTE: Record<Format, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/** GET /api/izvoz/<izvor>?format=csv|xlsx|pdf&<isti filtri kao na ekranu> */
export async function GET(request: Request, ctx: RouteContext<"/api/izvoz/[izvor]">) {
  const { izvor: kljuc } = await ctx.params;
  const izvor = Object.hasOwn(IZVORI, kljuc) ? IZVORI[kljuc] : undefined;
  if (!izvor) return Response.json({ greska: "Nepoznat popis." }, { status: 404 });

  const k = await pristupApi(izvor.pravo);
  if (k instanceof Response) return k;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") as Format;
  if (!(format in VRSTE)) return Response.json({ greska: "Nepoznat format." }, { status: 400 });

  const sp: Record<string, string | string[]> = {};
  for (const [a, v] of url.searchParams) if (a !== "format") sp[a] = a in sp ? [...[sp[a]!].flat(), v] : v;

  const najvise = NAJVISE_REDAKA[format];
  const redovi = await izvor.dohvati(k, sp, najvise + 1);
  if (redovi.length > najvise) {
    return Response.json(
      { greska: `Previše redaka za ${format.toUpperCase()} (najviše ${najvise.toLocaleString("hr-HR")}). Suzite filtre.` },
      { status: 413 },
    );
  }
  // nabavne cijene i marže: stupci se izbacuju na poslužitelju
  const stupci = dopusteniStupci(izvor.stupci, imaPosebno(k.prava, "costs"));
  const dan = danas();
  const ime = `${kljuc}-${dan}.${format}`;

  let sadrzaj: string | Buffer;
  if (format === "csv") sadrzaj = uCsv(stupci, redovi);
  else if (format === "xlsx") sadrzaj = await uXlsx(izvor.naslov, stupci, redovi);
  else
    sadrzaj = await uPdfTablicu(
      izvor.naslov,
      `${k.sesija.firma.naziv} · izvezeno ${dan.split("-").reverse().join(".")}. · ${redovi.length} redaka`,
      stupci,
      redovi,
    );

  await zapisiDnevnik(db, {
    firmaId: k.firmaId,
    korisnikId: k.korisnikId,
    ip: k.ip,
    radnja: "izvoz",
    entitet: "Izvoz",
    entitetId: kljuc,
    opis: `Izvoz: ${izvor.naslov} (${format.toUpperCase()}, ${redovi.length} redaka)`,
  });

  return new Response(new Uint8Array(typeof sadrzaj === "string" ? Buffer.from(sadrzaj, "utf8") : sadrzaj), {
    headers: {
      "Content-Type": VRSTE[format],
      "Content-Disposition": `attachment; filename="${ime}"`,
      "Cache-Control": "no-store",
    },
  });
}
