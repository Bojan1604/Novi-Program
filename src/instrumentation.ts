/** Pozadinski poslovi poslužitelja (Next.js pokreće `register` jednom pri pokretanju). */
export async function register() {
  if (process.env["NEXT_RUNTIME"] !== "nodejs" || process.env["POZADINSKI_POSLOVI"] === "0") return;
  const { pokreniPozadinskePoslove } = await import("./lib/pozadinski");
  pokreniPozadinskePoslove();
}
