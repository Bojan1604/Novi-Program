import { jeUuid } from "@/domain/id";
import { FORMATI, jeFormat, NAJVISE_NALJEPNICA } from "@/domain/naljepnice";
import { jedan, vise } from "@/domain/popis";
import { pristupApi } from "@/lib/akcija";
import { pdfNaljepnica } from "@/lib/naljepnice-pdf";
import { modeliZaPretragu, uvjetUredaja } from "@/queries/uredaji";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/naljepnice?format=a4-3x8&pocetak=1 i jedno od:
 *   uredaj=<id>[&uredaj=…] · primka=<id> · dokument=<id> · popis=1&<filtri popisa uređaja>
 */
export async function GET(request: Request) {
  const k = await pristupApi({ modul: "uredaji", razina: "pregled" });
  if (k instanceof Response) return k;
  const url = new URL(request.url);
  const sp: Record<string, string | string[]> = {};
  for (const [a, v] of url.searchParams) sp[a] = a in sp ? [...[sp[a]!].flat(), v] : v;
  const format = jedan(sp["format"]);
  if (!jeFormat(format)) return Response.json({ greska: "Nepoznat format naljepnice." }, { status: 400 });

  let where: Prisma.UredajWhereInput;
  const ids = vise(sp["uredaj"]).filter(jeUuid);
  const primka = jedan(sp["primka"]);
  const dokument = jedan(sp["dokument"]);
  if (ids.length) where = { firmaId: k.firmaId, id: { in: ids } };
  else if (primka && jeUuid(primka)) where = { firmaId: k.firmaId, primkaId: primka };
  else if (dokument && jeUuid(dokument)) where = { firmaId: k.firmaId, stavkeDokumenata: { some: { dokumentId: dokument } } };
  else if (sp["popis"]) {
    where = uvjetUredaja(
      k.firmaId,
      {
        trazi: jedan(sp["trazi"]),
        stanje: vise(sp["stanje"]),
        skladiste: vise(sp["skladiste"]),
        kategorija: vise(sp["kategorija"]),
        proizvodjac: vise(sp["proizvodjac"]),
        partnerId: jedan(sp["partner"]),
        primkaId: jedan(sp["primka"]),
        serijski: vise(sp["serijski"]),
        od: jedan(sp["od"]),
        do: jedan(sp["do"]),
        jamstvoDo: jedan(sp["jamstvoDo"]),
      },
      await modeliZaPretragu(k.db, k.firmaId, jedan(sp["trazi"])),
    );
  } else return Response.json({ greska: "Odaberite uređaje." }, { status: 400 });

  const uredaji = await k.db.uredaj.findMany({
    where,
    orderBy: { serijski: "asc" },
    take: NAJVISE_NALJEPNICA + 1,
    select: { serijski: true, model: { select: { naziv: true, proizvodjac: { select: { naziv: true } } } } },
  });
  if (uredaji.length === 0) return Response.json({ greska: "Nema uređaja za naljepnice." }, { status: 404 });
  if (uredaji.length > NAJVISE_NALJEPNICA) {
    return Response.json({ greska: `Najviše ${NAJVISE_NALJEPNICA} naljepnica odjednom. Suzite odabir.` }, { status: 400 });
  }
  const pdf = await pdfNaljepnica(
    FORMATI[format],
    uredaji.map((u) => ({ serijski: u.serijski, naziv: `${u.model.proizvodjac.naziv} ${u.model.naziv}` })),
    url.origin,
    Number(jedan(sp["pocetak"]) ?? 1) || 1,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="naljepnice-${format}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
