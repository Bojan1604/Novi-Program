/**
 * Zaključavanje u bazi za radnje koje se ne smiju izvesti dvaput istovremeno
 * (dvije kartice, dva korisnika). Vrijedi do kraja transakcije.
 */
type SIzvrsavanjem = { $executeRaw: (upit: TemplateStringsArray, ...vrijednosti: unknown[]) => Promise<number> };

export async function zakljucajKljuc(tx: SIzvrsavanjem, kljuc: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${kljuc}, 0))`;
}
