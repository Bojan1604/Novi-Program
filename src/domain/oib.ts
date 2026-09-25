/**
 * OIB — provjera kontrolne znamenke (ISO 7064, MOD 11,10).
 */
export function jeOib(vrijednost: string): boolean {
  if (!/^\d{11}$/.test(vrijednost)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(vrijednost[i])) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  let kontrola = 11 - a;
  if (kontrola === 10) kontrola = 0;
  return kontrola === Number(vrijednost[10]);
}

/** Čita OIB iz upisa (dopušta razmake i prefiks „HR“). */
export function procitajOib(upis: string): { ok: true; vrijednost: string } | { ok: false; greska: string } {
  const tekst = upis.replace(/\s+/g, "").replace(/^HR/i, "");
  if (tekst === "") return { ok: false, greska: "Upišite OIB." };
  if (!/^\d{11}$/.test(tekst)) return { ok: false, greska: "OIB mora imati točno 11 znamenki." };
  if (!jeOib(tekst)) return { ok: false, greska: "OIB nije ispravan (kontrolna znamenka ne odgovara)." };
  return { ok: true, vrijednost: tekst };
}

/** Kontrolna znamenka za prvih 10 znamenki (za demo podatke i testove). */
export function kontrolnaZnamenkaOib(prvih10: string): number {
  if (!/^\d{10}$/.test(prvih10)) throw new Error("Potrebno je točno 10 znamenki.");
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(prvih10[i])) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  const kontrola = 11 - a;
  return kontrola === 10 ? 0 : kontrola;
}
