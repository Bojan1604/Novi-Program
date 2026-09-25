/** Poziv vanjskog servisa s vremenskim ograničenjem i ljudskim porukama umjesto tehničkih grešaka. */
export class GreskaVanjska extends Error {
  constructor(poruka: string) {
    super(poruka);
    this.name = "GreskaVanjska";
  }
}

export async function dohvatiJson(url: string, opcije: RequestInit & { sekundi?: number; naziv: string }): Promise<unknown> {
  const { sekundi = 8, naziv, ...init } = opcije;
  let odgovor: Response;
  try {
    odgovor = await fetch(url, { ...init, signal: AbortSignal.timeout(sekundi * 1000), cache: "no-store" });
  } catch (e) {
    const istek = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError";
    throw new GreskaVanjska(
      istek
        ? `${naziv} ne odgovara. Pokušajte kasnije ili upišite podatke ručno.`
        : `${naziv} nije dostupan (provjerite internetsku vezu). Podatke možete upisati ručno.`,
    );
  }
  if (odgovor.status === 404) return null;
  if (!odgovor.ok) throw new GreskaVanjska(`${naziv} je javio grešku (${odgovor.status}). Pokušajte kasnije ili upišite podatke ručno.`);
  try {
    return await odgovor.json();
  } catch {
    throw new GreskaVanjska(`${naziv} je vratio neočekivan odgovor. Podatke upišite ručno.`);
  }
}
