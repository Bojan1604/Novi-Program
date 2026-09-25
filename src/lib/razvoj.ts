/** Testne stranice za komponente postoje samo kad ih testovi u pregledniku uključe. */
export function komponenteUkljucene(): boolean {
  return process.env["E2E_KOMPONENTE"] === "1";
}

export const TESTNI_PARTNERI = [
  "Alfa d.o.o.",
  "Alfa Beta d.d.",
  "Alfa Informatika j.d.o.o.",
  "Beta Servis d.o.o.",
  "Gama Trgovina d.o.o.",
  "Delta Najam d.o.o.",
  "Epsilon Računala d.o.o.",
  "Zeta Uredska oprema",
  "Čakovec Print d.o.o.",
  "Đakovo Tehnika j.d.o.o.",
].map((naziv, i) => ({ id: `p${i + 1}`, naziv, opis: `OIB 0000000000${i}` }));
