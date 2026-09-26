import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Šifriranje tajni u bazi (npr. SMTP lozinka) — AES-256-GCM.
 * Ključ iz TAJNI_KLJUC (.env); bez njega izveden iz DATABASE_URL (bolje nego čisti tekst; u produkciji postaviti ključ).
 */
function kljuc(): Buffer {
  const izvor = process.env["TAJNI_KLJUC"] || zamjenskiIzvor();
  return createHash("sha256").update(izvor).digest();
}

const zamjenskiIzvor = () => `erp-wms:${process.env["DATABASE_URL"] ?? ""}`;

/**
 * Ključevi za čitanje: trenutni, pa zamjenski (iz DATABASE_URL) — tajne spremljene prije nego što je
 * postavljen TAJNI_KLJUC (npr. pokreni.bat ga postavi naknadno) i dalje se čitaju; pri sljedećem spremanju
 * šifriraju se novim ključem.
 */
function kljuceviZaCitanje(): Buffer[] {
  const k = [kljuc()];
  if (process.env["TAJNI_KLJUC"]) k.push(createHash("sha256").update(zamjenskiIzvor()).digest());
  return k;
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
  const b = Buffer.from(zapis.slice(3), "base64");
  for (const k of kljuceviZaCitanje()) {
    try {
      const d = createDecipheriv("aes-256-gcm", k, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
    } catch {
      // sljedeći ključ
    }
  }
  return null;
}
