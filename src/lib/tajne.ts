import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Šifriranje tajni u bazi (npr. SMTP lozinka) — AES-256-GCM.
 * Ključ iz TAJNI_KLJUC (.env); bez njega izveden iz DATABASE_URL (bolje nego čisti tekst; u produkciji postaviti ključ).
 */
function kljuc(): Buffer {
  const izvor = process.env["TAJNI_KLJUC"] || `erp-wms:${process.env["DATABASE_URL"] ?? ""}`;
  return createHash("sha256").update(izvor).digest();
}

export function sifriraj(tekst: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kljuc(), iv);
  const sifra = Buffer.concat([c.update(tekst, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), sifra]).toString("base64")}`;
}

/** null ako tajna nije ispravna ili je šifrirana drugim ključem. */
export function desifriraj(zapis: string | null | undefined): string | null {
  if (!zapis?.startsWith("v1:")) return null;
  try {
    const b = Buffer.from(zapis.slice(3), "base64");
    const d = createDecipheriv("aes-256-gcm", kljuc(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
