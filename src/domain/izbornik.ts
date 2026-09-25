import { zadovoljava, type PotrebnoPravo, type Prava } from "./prava";

export type StavkaIzbornika = { naziv: string; putanja: string; grupa: string; pravo: PotrebnoPravo };

/** Samo stavke za koje korisnik ima pravo, redoslijedom izbornika. */
export function izbornikZa(prava: Prava, stavke: readonly StavkaIzbornika[]): StavkaIzbornika[] {
  return stavke.filter((s) => zadovoljava(prava, s.pravo));
}

/** Prva stranica na koju korisnik smije (početna nakon prijave) ili null. */
export function prvaDopustena(prava: Prava, stavke: readonly StavkaIzbornika[]): string | null {
  return izbornikZa(prava, stavke)[0]?.putanja ?? null;
}
