import "server-only";
import bwipjs from "bwip-js/node";
import { GreskaKorisniku } from "./greske";

/** Token agenta iz zaglavlja „Authorization: Bearer …“. */
export function tokenAgenta(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+([\w-]{20,200})$/.exec(h.trim());
  return m ? m[1]! : null;
}

/** Tijelo JSON-a agenta (najviše 64 KB) ili null. */
export async function jsonAgenta(request: Request): Promise<unknown> {
  const t = await request.text();
  if (t.length > 65_536) throw new GreskaKorisniku("Zahtjev je prevelik.");
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
