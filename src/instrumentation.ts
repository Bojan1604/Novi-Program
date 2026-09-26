/** Pozadinski poslovi poslužitelja (Next.js pokreće `register` jednom pri pokretanju). */
export async function register() {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  if (!process.env["TAJNI_KLJUC"] && process.env["NODE_ENV"] === "production")
    console.warn(
      "UPOZORENJE: TAJNI_KLJUC nije postavljen — lozinke i certifikat šifriraju se ključem iz DATABASE_URL. Postavite TAJNI_KLJUC u .env.",
    );
  if (process.env["POZADINSKI_POSLOVI"] === "0") return;
  const { pokreniPozadinskePoslove } = await import("./lib/pozadinski");
  pokreniPozadinskePoslove();
}
