/** Opasna zona (korak 6.7): načini brisanja i granica čišćenja dnevnika — dijele ih servis i obrazac. */
export type NacinBrisanja = "PROMET" | "SVE";
export const NACINI_BRISANJA: Record<NacinBrisanja, string> = {
  PROMET: "Promet (dokumenti, uređaji, najam, servis, nabava, troškovi) — šifrarnici, partneri i postavke ostaju",
  SVE: "Sve podatke firme — ostaju samo postavke firme, uloge, korisnici i dnevnik",
};

/** Najmanja starost zapisa dnevnika koji se smiju obrisati (mjeseci). */
export const DNEVNIK_NAJMANJE_MJESECI = 12;
