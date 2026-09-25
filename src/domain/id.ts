/** Identifikatori zapisa (UUID). Sve što dolazi od klijenta provjerava se prije upita u bazu. */
export function jeUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
