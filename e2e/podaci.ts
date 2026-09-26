export const E2E = {
  firma: "E2E Firma d.o.o.",
  /** boja firme — tamnozelena (tekst na njoj mora biti bijel) */
  boja: "#0f766e",
  admin: { ime: "Ana Anić", email: "ana@e2e.hr", lozinka: "E2e-lozinka-2026" },
  prodavac: { ime: "Petar Prodavač", email: "petar@e2e.hr" },
  /** odobrava zahtjeve drugih (izlaz) */
  voditelj: { ime: "Vesna Voditelj", email: "vesna@e2e.hr" },
  /** zaseban korisnik za test zaključavanja, da ne blokira ostale testove */
  zakljucavanje: { email: "zakljucaj@e2e.hr" },
  /** klijent na portalu (partner E2E Kupac) i klijent drugog partnera (napad na tuđe podatke) */
  klijent: { ime: "Ivana Klijent", email: "klijent@e2e.hr", lozinka: "Portal-lozinka-2026" },
  drugiKlijent: { email: "drugi@e2e.hr" },
  /** korisnik portala partnera „E2E Distributer d.o.o.“ (MDM) */
  distributer: { email: "distributer@e2e.hr" },
};
