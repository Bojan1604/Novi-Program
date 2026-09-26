/**
 * Storno i odobrenje — čista pravila (korak 2.6). Iznosi u centima, količine u tisućinkama.
 * Odobrenje ima negativne količine; uspoređuje se apsolutna vrijednost s ostatkom izvornog računa.
 */

export type IzvornaStavka = { id: string; naziv: string; kolicina: number; iznos: number };
export type OdobrenaStavka = { izvornaStavkaId: string | null; kolicina: number; iznos: number };

/**
 * Smije li se izdati odobrenje:
 *  - svaka stavka se odnosi na stavku izvornog računa i ima negativnu količinu;
 *  - po stavci: već odobreno + ovo ≤ količina na računu;
 *  - ukupno: već odobreno + ovo ≤ ukupno računa (ostatak se ne može prijeći ni iz dvije kartice).
 */
export function provjeriOdobrenje(p: {
  izvorne: readonly IzvornaStavka[];
  izvorUkupno: number;
  vecOdobreno: readonly OdobrenaStavka[];
  vecOdobrenoUkupno: number;
  nove: readonly OdobrenaStavka[];
  ukupno: number;
}): string | null {
  if (p.nove.length === 0) return "Odobrenje nema stavki.";
  const izvorne = new Map(p.izvorne.map((s) => [s.id, s]));
  const poStavci = new Map<string, number>();
  for (const s of p.vecOdobreno)
    if (s.izvornaStavkaId) poStavci.set(s.izvornaStavkaId, (poStavci.get(s.izvornaStavkaId) ?? 0) + Math.abs(s.kolicina));
  for (const [i, s] of p.nove.entries()) {
    const iz = s.izvornaStavkaId ? izvorne.get(s.izvornaStavkaId) : undefined;
    if (!iz) return `Stavka ${i + 1} nije s izvornog računa.`;
    if (s.kolicina >= 0 || s.iznos > 0) return `Stavka ${i + 1}: na odobrenju količina mora biti negativna.`;
    const ukupnoStavke = (poStavci.get(iz.id) ?? 0) + Math.abs(s.kolicina);
    if (ukupnoStavke > Math.abs(iz.kolicina)) return `Stavka „${iz.naziv}“: odobrava se više nego što je bilo na računu.`;
    poStavci.set(iz.id, ukupnoStavke);
  }
  if (p.ukupno >= 0) return "Odobrenje mora imati negativan iznos.";
  const ostatak = p.izvorUkupno - Math.abs(p.vecOdobrenoUkupno);
  if (Math.abs(p.ukupno) > ostatak) return `Odobrenje (${fmt(Math.abs(p.ukupno))} €) je veće od ostatka računa (${fmt(ostatak)} €).`;
  return null;
}

/**
 * Storno je moguć za izdani račun bez odobrenja (inače se ostatak odobrava odobrenjem)
 * i za račun za predujam koji još nije odbijen na konačnom računu.
 */
export function provjeriStorno(p: { vrsta: string; status: string; brojOdobrenja: number; predujamIskoristen?: boolean }): string | null {
  if (p.vrsta !== "RACUN" && p.vrsta !== "PREDUJAM") return "Stornirati se može samo račun.";
  if (p.vrsta === "PREDUJAM" && p.predujamIskoristen) return "Predujam je već odbijen na konačnom računu — prvo stornirajte konačni račun.";
  if (p.status === "STORNIRAN") return "Račun je već storniran.";
  if (p.status !== "IZDAN") return "Stornirati se može samo izdani račun.";
  if (p.brojOdobrenja > 0) return "Za račun postoje odobrenja — ostatak odobrite novim odobrenjem umjesto storna.";
  return null;
}

/** Iznos koji se gleda za plaćanje: storniran račun i storno dokument više se ne naplaćuju. */
export function ukupnoZaPlacanje(vrsta: string, status: string, ukupno: number): number {
  return status === "STORNIRAN" || vrsta === "STORNO" ? 0 : ukupno;
}

function fmt(c: number) {
  return (c / 100).toFixed(2).replace(".", ",");
}
