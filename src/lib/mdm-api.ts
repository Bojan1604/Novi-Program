import "server-only";
import bwipjs from "bwip-js/node";
import { GreskaKorisniku } from "./greske";

/** Token agenta iz zaglavlja „Authorization: Bearer …“. */
export function tokenAgenta(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+([\w-]{20,200})$/.exec(h.trim());
  return m ? m[1]! : null;
}

/**
 * Tijelo zahtjeva s tvrdom granicom: čita tok i prekida čim prijeđe `najvise` bajtova
 * (Content-Length se ne uzima zdravo za gotovo — „chunked“ zahtjev ga nema).
 */
export async function citajTijelo(request: Request, najvise: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length") ?? "0") > najvise) throw new GreskaKorisniku("Zahtjev je prevelik.");
  const citac = request.body?.getReader();
  if (!citac) return new Uint8Array(0);
  const dijelovi: Uint8Array[] = [];
  let ukupno = 0;
  for (;;) {
    const { done, value } = await citac.read();
    if (done) break;
    ukupno += value.byteLength;
    if (ukupno > najvise) {
      await citac.cancel();
      throw new GreskaKorisniku("Zahtjev je prevelik.");
    }
    dijelovi.push(value);
  }
  const r = new Uint8Array(ukupno);
  let i = 0;
  for (const d of dijelovi) {
    r.set(d, i);
    i += d.byteLength;
  }
  return r;
}

/** Tijelo JSON-a agenta (najviše 64 KB). */
export async function jsonAgenta(request: Request): Promise<unknown> {
  const t = new TextDecoder().decode(await citajTijelo(request, 65_536));
  try {
    return JSON.parse(t);
  } catch {
    throw new GreskaKorisniku("Neispravan JSON.");
  }
}

export function odgovorGreske(g: unknown): Response {
  if (g instanceof GreskaKorisniku) return Response.json({ greska: g.message }, { status: 400 });
  throw g;
}

/** QR za upis: agent ga skenira i dobiva adresu poslužitelja i kod. */
export async function qrUpisa(adresa: string, kod: string): Promise<Response> {
  const png = await bwipjs.toBuffer({ bcid: "qrcode", text: JSON.stringify({ erpMdm: 1, adresa, kod }), scale: 5 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
}

/** Adresa poslužitelja kako je vidi preglednik (za QR). */
export function adresaPosluzitelja(request: Request): string {
  return new URL(request.url).origin;
}
