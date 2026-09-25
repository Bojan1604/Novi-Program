/**
 * Adresa testne baze. Testovi i punjenje demo podataka BRIŠU sadržaj baze,
 * zato se smiju pokrenuti samo nad bazom čije ime sadrži „test“.
 */
export function adresaTestneBaze(env: Record<string, string | undefined> = process.env): string {
  const url = env["DATABASE_URL_TEST"];
  if (!url) {
    throw new Error("DATABASE_URL_TEST nije postavljen (pogledajte .env.example).");
  }
  const imeBaze = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(imeBaze)) {
    throw new Error(`Testna baza mora u imenu imati „test“ (dobiveno: „${imeBaze}“). Ne pokrećem testove nad pravom bazom.`);
  }
  return url;
}
