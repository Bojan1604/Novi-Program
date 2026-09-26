/**
 * Zadana prva firma i administrator (pokreni.bat / instaliraj.sh ne pitaju ništa): administrator se prijavi
 * ovim podacima, a naziv i OIB firme te svoju e-poštu i lozinku upiše u programu (nadzorna ploča ga podsjeća).
 */
export const ZADANO = {
  firma: "Moja firma d.o.o.",
  /** ispravan kontrolni broj, ali nije ničiji OIB — zamjenjuje se u Postavkama firme */
  oib: "12345678903",
  ime: "Administrator",
  email: "admin@firma.hr",
  lozinka: "Promijeni-me-2026",
} as const;
