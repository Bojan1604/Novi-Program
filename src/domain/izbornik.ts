import { imaPravo, type Modul, type Prava, type Razina } from "./prava";

export type StavkaIzbornika = { naziv: string; putanja: string; modul: Modul; razina: Razina; grupa: string };

/** Samo stavke za koje korisnik ima pravo, redoslijedom izbornika. */
export function izbornikZa(prava: Prava, stavke: readonly StavkaIzbornika[]): StavkaIzbornika[] {
  return stavke.filter((s) => imaPravo(prava, s.modul, s.razina));
}

/** Prva stranica na koju korisnik smije (početna nakon prijave) ili null. */
export function prvaDopustena(prava: Prava, stavke: readonly StavkaIzbornika[]): string | null {
  return izbornikZa(prava, stavke)[0]?.putanja ?? null;
}
