import { NextResponse, type NextRequest } from "next/server";

/**
 * Brzo preusmjeravanje na prijavu kad kolačić sesije ne postoji.
 * Ovo NIJE provjera prava — stvarnu provjeru radi poslužitelj za svaku stranicu i akciju.
 * Portal klijenata (/portal) ima svoju prijavu i svoj kolačić.
 */
export function proxy(request: NextRequest) {
  const put = request.nextUrl.pathname;
  const url = request.nextUrl.clone();
  if (put === "/portal" || put.startsWith("/portal/")) {
    if (put === "/portal/prijava" || put.startsWith("/portal/lozinka") || request.cookies.has("erp_portal")) return NextResponse.next();
    url.pathname = "/portal/prijava";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (request.cookies.has("erp_sesija")) return NextResponse.next();
  const dalje = put + request.nextUrl.search;
  url.pathname = "/prijava";
  url.search = dalje === "/" ? "" : `?dalje=${encodeURIComponent(dalje)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!prijava|api/|_next/|skener/|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt|webmanifest)$).*)"],
};
