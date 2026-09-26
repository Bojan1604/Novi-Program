import { NextResponse, type NextRequest } from "next/server";

/**
 * Brzo preusmjeravanje na prijavu kad kolačić sesije ne postoji.
 * Ovo NIJE provjera prava — stvarnu provjeru radi poslužitelj za svaku stranicu i akciju.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("erp_sesija")) return NextResponse.next();
  const url = request.nextUrl.clone();
  const dalje = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/prijava";
  url.search = dalje === "/" ? "" : `?dalje=${encodeURIComponent(dalje)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!prijava|api/|_next/|skener/|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt|webmanifest)$).*)"],
};
